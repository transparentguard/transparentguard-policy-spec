/**
 * TransparentGuard — Azure Terraform Module
 *
 * Deploys the TransparentGuard proxy on Microsoft Azure using:
 *   - Azure Container Apps (serverless, auto-scaling, Dapr-ready)
 *   - Azure Virtual Network + private subnet
 *   - Azure Database for PostgreSQL Flexible Server — audit log persistence
 *   - Azure Blob Storage — audit JSONL archive
 *   - Azure Container Registry — container image hosting
 *   - Azure Key Vault — API key storage
 *   - Managed Identity — zero-credential auth to Azure services
 *
 * Usage:
 *   module "tg_azure" {
 *     source              = "./modules/azure"
 *     resource_group_name = azurerm_resource_group.main.name
 *     location            = "westeurope"
 *     environment         = "production"
 *     image               = "ghcr.io/transparentguard/proxy:latest"
 *   }
 */

terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "azurerm" {
  features {
    key_vault {
      purge_soft_delete_on_destroy    = false
      recover_soft_deleted_key_vaults = true
    }
  }
}

locals {
  name_prefix = "tg-proxy-${var.environment}"
  common_tags = merge(var.tags, {
    Application = "transparentguard-proxy"
    Environment = var.environment
    ManagedBy   = "terraform"
  })
}

# ---------------------------------------------------------------------------
# Resource Group (created externally; reference only)
# ---------------------------------------------------------------------------

data "azurerm_resource_group" "main" {
  name = var.resource_group_name
}

data "azurerm_client_config" "current" {}

# ---------------------------------------------------------------------------
# Virtual Network
# ---------------------------------------------------------------------------

resource "azurerm_virtual_network" "main" {
  name                = "${local.name_prefix}-vnet"
  resource_group_name = data.azurerm_resource_group.main.name
  location            = var.location
  address_space       = [var.vnet_address_space]
  tags                = local.common_tags
}

resource "azurerm_subnet" "container_apps" {
  name                 = "container-apps"
  resource_group_name  = data.azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.container_apps_subnet_cidr]

  # Required for Container Apps environment
  delegation {
    name = "container-apps-delegation"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "db" {
  name                 = "database"
  resource_group_name  = data.azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = [var.db_subnet_cidr]

  service_endpoints = ["Microsoft.Storage"]

  delegation {
    name = "postgresql-delegation"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_network_security_group" "container_apps" {
  name                = "${local.name_prefix}-nsg"
  resource_group_name = data.azurerm_resource_group.main.name
  location            = var.location
  tags                = local.common_tags

  security_rule {
    name                       = "AllowHTTPS"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowHTTP"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "container_apps" {
  subnet_id                 = azurerm_subnet.container_apps.id
  network_security_group_id = azurerm_network_security_group.container_apps.id
}

# ---------------------------------------------------------------------------
# Managed Identity
# ---------------------------------------------------------------------------

resource "azurerm_user_assigned_identity" "proxy" {
  name                = "${local.name_prefix}-identity"
  resource_group_name = data.azurerm_resource_group.main.name
  location            = var.location
  tags                = local.common_tags
}

# ---------------------------------------------------------------------------
# Azure Key Vault
# ---------------------------------------------------------------------------

resource "azurerm_key_vault" "main" {
  name                = substr("${local.name_prefix}-kv", 0, 24)
  resource_group_name = data.azurerm_resource_group.main.name
  location            = var.location
  tenant_id           = data.azurerm_client_config.current.tenant_id
  sku_name            = "standard"

  soft_delete_retention_days  = 7
  purge_protection_enabled    = var.environment == "production"
  enable_rbac_authorization   = true

  tags = local.common_tags
}

resource "azurerm_role_assignment" "kv_secrets_officer" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_role_assignment" "kv_secrets_user" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.proxy.principal_id
}

resource "azurerm_key_vault_secret" "upstream_api_key" {
  name         = "upstream-api-key"
  value        = var.upstream_api_key
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.kv_secrets_officer]
}

resource "azurerm_key_vault_secret" "tg_api_key" {
  count        = var.tg_api_key != "" ? 1 : 0
  name         = "tg-api-key"
  value        = var.tg_api_key
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.kv_secrets_officer]
}

# ---------------------------------------------------------------------------
# Azure Database for PostgreSQL Flexible Server
# ---------------------------------------------------------------------------

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "azurerm_private_dns_zone" "postgres" {
  name                = "${local.name_prefix}.private.postgres.database.azure.com"
  resource_group_name = data.azurerm_resource_group.main.name
  tags                = local.common_tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = "${local.name_prefix}-postgres-dns-link"
  resource_group_name   = data.azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  virtual_network_id    = azurerm_virtual_network.main.id
}

resource "azurerm_postgresql_flexible_server" "audit" {
  name                   = "${local.name_prefix}-db"
  resource_group_name    = data.azurerm_resource_group.main.name
  location               = var.location
  version                = "15"
  delegated_subnet_id    = azurerm_subnet.db.id
  private_dns_zone_id    = azurerm_private_dns_zone.postgres.id
  administrator_login    = "tgadmin"
  administrator_password = random_password.db_password.result
  zone                   = "1"
  sku_name               = var.db_sku_name
  storage_mb             = var.db_storage_mb
  backup_retention_days  = 7

  high_availability {
    mode                      = var.environment == "production" ? "ZoneRedundant" : "Disabled"
    standby_availability_zone = var.environment == "production" ? "2" : null
  }

  maintenance_window {
    day_of_week  = 0
    start_hour   = 3
    start_minute = 0
  }

  tags = local.common_tags

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]
}

resource "azurerm_postgresql_flexible_server_database" "audit" {
  name      = "tg_audit"
  server_id = azurerm_postgresql_flexible_server.audit.id
  collation = "en_US.utf8"
  charset   = "UTF8"
}

# ---------------------------------------------------------------------------
# Azure Blob Storage — audit archive
# ---------------------------------------------------------------------------

resource "azurerm_storage_account" "audit" {
  name                     = replace(substr("${local.name_prefix}audit", 0, 24), "-", "")
  resource_group_name      = data.azurerm_resource_group.main.name
  location                 = var.location
  account_tier             = "Standard"
  account_replication_type = var.environment == "production" ? "GRS" : "LRS"

  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false

  blob_properties {
    versioning_enabled  = true
    change_feed_enabled = true

    delete_retention_policy {
      days = 7
    }

    container_delete_retention_policy {
      days = 7
    }
  }

  tags = local.common_tags
}

resource "azurerm_storage_container" "audit" {
  name                  = "audit-logs"
  storage_account_name  = azurerm_storage_account.audit.name
  container_access_type = "private"
}

resource "azurerm_storage_management_policy" "audit" {
  storage_account_id = azurerm_storage_account.audit.id

  rule {
    name    = "audit-lifecycle"
    enabled = true
    filters {
      blob_types   = ["blockBlob"]
      prefix_match = ["audit-logs/"]
    }
    actions {
      base_blob {
        tier_to_cool_after_days_since_modification_greater_than    = 30
        tier_to_archive_after_days_since_modification_greater_than = 90
        delete_after_days_since_modification_greater_than          = var.audit_retention_days
      }
      snapshot {
        delete_after_days_since_creation_greater_than = var.audit_retention_days
      }
    }
  }
}

resource "azurerm_role_assignment" "storage_blob_contributor" {
  scope                = azurerm_storage_account.audit.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.proxy.principal_id
}

# ---------------------------------------------------------------------------
# Azure Container Registry
# ---------------------------------------------------------------------------

resource "azurerm_container_registry" "main" {
  count               = var.create_container_registry ? 1 : 0
  name                = replace("${local.name_prefix}acr", "-", "")
  resource_group_name = data.azurerm_resource_group.main.name
  location            = var.location
  sku                 = "Standard"
  admin_enabled       = false
  tags                = local.common_tags
}

resource "azurerm_role_assignment" "acr_pull" {
  count                = var.create_container_registry ? 1 : 0
  scope                = azurerm_container_registry.main[0].id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.proxy.principal_id
}

# ---------------------------------------------------------------------------
# Container Apps Environment
# ---------------------------------------------------------------------------

resource "azurerm_log_analytics_workspace" "main" {
  name                = "${local.name_prefix}-logs"
  resource_group_name = data.azurerm_resource_group.main.name
  location            = var.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.common_tags
}

resource "azurerm_container_app_environment" "main" {
  name                       = "${local.name_prefix}-env"
  resource_group_name        = data.azurerm_resource_group.main.name
  location                   = var.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main.id
  infrastructure_subnet_id   = azurerm_subnet.container_apps.id

  internal_load_balancer_enabled = !var.public_endpoint

  tags = local.common_tags
}

# ---------------------------------------------------------------------------
# Container App — proxy
# ---------------------------------------------------------------------------

resource "azurerm_container_app" "proxy" {
  name                         = local.name_prefix
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = data.azurerm_resource_group.main.name
  revision_mode                = "Single"

  tags = local.common_tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.proxy.id]
  }

  secret {
    name  = "upstream-api-key"
    value = var.upstream_api_key
  }

  dynamic "secret" {
    for_each = var.tg_api_key != "" ? [1] : []
    content {
      name  = "tg-api-key"
      value = var.tg_api_key
    }
  }

  secret {
    name  = "database-url"
    value = "postgres://tgadmin:${random_password.db_password.result}@${azurerm_postgresql_flexible_server.audit.fqdn}:5432/tg_audit?sslmode=require"
  }

  ingress {
    external_enabled           = var.public_endpoint
    target_port                = 8080
    allow_insecure_connections = false

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.min_replicas
    max_replicas = var.max_replicas

    container {
      name   = "proxy"
      image  = var.image
      cpu    = var.cpu
      memory = var.memory

      env {
        name  = "PORT"
        value = "8080"
      }

      env {
        name  = "UPSTREAM_URL"
        value = var.upstream_url
      }

      env {
        name        = "UPSTREAM_API_KEY"
        secret_name = "upstream-api-key"
      }

      dynamic "env" {
        for_each = var.tg_api_key != "" ? [1] : []
        content {
          name        = "TG_API_KEY"
          secret_name = "tg-api-key"
        }
      }

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      env {
        name  = "AUDIT_AZURE_CONTAINER"
        value = azurerm_storage_container.audit.name
      }

      env {
        name  = "AUDIT_AZURE_ACCOUNT"
        value = azurerm_storage_account.audit.name
      }

      liveness_probe {
        path             = "/health"
        port             = 8080
        transport        = "HTTP"
        initial_delay    = 5
        period_seconds   = 10
        failure_count_threshold = 3
      }

      readiness_probe {
        path             = "/ready"
        port             = 8080
        transport        = "HTTP"
        initial_delay    = 3
        period_seconds   = 5
        failure_count_threshold = 3
      }
    }

    http_scale_rule {
      name                = "http-scale"
      concurrent_requests = tostring(var.scale_concurrent_requests)
    }
  }
}
