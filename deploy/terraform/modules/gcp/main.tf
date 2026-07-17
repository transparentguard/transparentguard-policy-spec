/**
 * TransparentGuard — GCP Terraform Module
 *
 * Deploys the TransparentGuard proxy on Google Cloud using:
 *   - Cloud Run (serverless, auto-scaling, no cluster management)
 *   - VPC + Serverless VPC Access connector (private egress to upstream APIs)
 *   - Cloud SQL (PostgreSQL) — audit log persistence
 *   - Google Cloud Storage — audit JSONL archive
 *   - Artifact Registry — container image hosting
 *   - Secret Manager — API key storage
 *
 * Usage:
 *   module "tg_gcp" {
 *     source       = "./modules/gcp"
 *     project_id   = var.gcp_project_id
 *     region       = "europe-west4"
 *     environment  = "production"
 *     image        = "ghcr.io/transparentguard/proxy:latest"
 *   }
 */

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  name_prefix = "tg-proxy-${var.environment}"
  common_labels = merge(var.labels, {
    app         = "transparentguard-proxy"
    environment = var.environment
    managed_by  = "terraform"
  })
}

# ---------------------------------------------------------------------------
# VPC & Serverless VPC Access
# ---------------------------------------------------------------------------

resource "google_compute_network" "vpc" {
  name                    = "${local.name_prefix}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "private" {
  name          = "${local.name_prefix}-private"
  network       = google_compute_network.vpc.id
  region        = var.region
  ip_cidr_range = var.private_subnet_cidr

  private_ip_google_access = true

  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

resource "google_compute_router" "router" {
  name    = "${local.name_prefix}-router"
  network = google_compute_network.vpc.id
  region  = var.region
}

resource "google_compute_router_nat" "nat" {
  name                               = "${local.name_prefix}-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

resource "google_vpc_access_connector" "serverless" {
  name          = "${local.name_prefix}-vpcconn"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = var.vpc_connector_cidr
  min_instances = 2
  max_instances = 10
  machine_type  = "e2-micro"
}

# ---------------------------------------------------------------------------
# Secret Manager — API keys
# ---------------------------------------------------------------------------

resource "google_secret_manager_secret" "upstream_api_key" {
  secret_id = "${local.name_prefix}-upstream-api-key"
  labels    = local.common_labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "upstream_api_key" {
  secret      = google_secret_manager_secret.upstream_api_key.id
  secret_data = var.upstream_api_key
}

resource "google_secret_manager_secret" "tg_api_key" {
  count     = var.tg_api_key != "" ? 1 : 0
  secret_id = "${local.name_prefix}-tg-api-key"
  labels    = local.common_labels

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_version" "tg_api_key" {
  count       = var.tg_api_key != "" ? 1 : 0
  secret      = google_secret_manager_secret.tg_api_key[0].id
  secret_data = var.tg_api_key
}

# ---------------------------------------------------------------------------
# Cloud SQL — audit log persistence
# ---------------------------------------------------------------------------

resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "google_sql_database_instance" "audit" {
  name             = "${local.name_prefix}-db"
  database_version = "POSTGRES_15"
  region           = var.region

  deletion_protection = var.environment == "production"

  settings {
    tier              = var.db_tier
    availability_type = var.environment == "production" ? "REGIONAL" : "ZONAL"

    disk_autoresize       = true
    disk_autoresize_limit = 100
    disk_size             = 20

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = var.environment == "production"
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 7
      }
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.vpc.id
      enable_private_path_for_google_cloud_services = true
    }

    database_flags {
      name  = "log_connections"
      value = "on"
    }

    database_flags {
      name  = "log_disconnections"
      value = "on"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false
    }
  }

  depends_on = [google_compute_network.vpc]
}

resource "google_sql_database" "audit" {
  name     = "tg_audit"
  instance = google_sql_database_instance.audit.name
}

resource "google_sql_user" "proxy" {
  name     = "tg_proxy"
  instance = google_sql_database_instance.audit.name
  password = random_password.db_password.result
}

# ---------------------------------------------------------------------------
# GCS — audit JSONL archive
# ---------------------------------------------------------------------------

resource "google_storage_bucket" "audit" {
  name          = "${var.project_id}-${local.name_prefix}-audit"
  location      = var.gcs_location
  force_destroy = var.environment != "production"

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
    condition {
      age = 30
    }
  }

  lifecycle_rule {
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
    condition {
      age = 90
    }
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      age = var.audit_retention_days
    }
  }

  labels = local.common_labels
}

# ---------------------------------------------------------------------------
# Service Account
# ---------------------------------------------------------------------------

resource "google_service_account" "proxy" {
  account_id   = "${local.name_prefix}-sa"
  display_name = "TransparentGuard Proxy (${var.environment})"
}

resource "google_project_iam_member" "secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.proxy.email}"
}

resource "google_project_iam_member" "storage_object_creator" {
  project = var.project_id
  role    = "roles/storage.objectCreator"
  member  = "serviceAccount:${google_service_account.proxy.email}"
}

resource "google_project_iam_member" "logging_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.proxy.email}"
}

resource "google_project_iam_member" "metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.proxy.email}"
}

# ---------------------------------------------------------------------------
# Artifact Registry
# ---------------------------------------------------------------------------

resource "google_artifact_registry_repository" "proxy" {
  repository_id = "${local.name_prefix}-images"
  location      = var.region
  format        = "DOCKER"
  description   = "TransparentGuard proxy container images"
  labels        = local.common_labels
}

# ---------------------------------------------------------------------------
# Cloud Run — proxy service
# ---------------------------------------------------------------------------

resource "google_cloud_run_v2_service" "proxy" {
  name     = local.name_prefix
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  labels = local.common_labels

  template {
    service_account = google_service_account.proxy.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    vpc_access {
      connector = google_vpc_access_connector.serverless.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.image

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle = true
        startup_cpu_boost = true
      }

      ports {
        container_port = 8080
      }

      env {
        name  = "PORT"
        value = "8080"
      }

      env {
        name  = "UPSTREAM_URL"
        value = var.upstream_url
      }

      env {
        name = "UPSTREAM_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.upstream_api_key.secret_id
            version = "latest"
          }
        }
      }

      dynamic "env" {
        for_each = var.tg_api_key != "" ? [1] : []
        content {
          name = "TG_API_KEY"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.tg_api_key[0].secret_id
              version = "latest"
            }
          }
        }
      }

      env {
        name  = "DATABASE_URL"
        value = "postgres://tg_proxy:${random_password.db_password.result}@${google_sql_database_instance.audit.private_ip_address}:5432/tg_audit"
      }

      env {
        name  = "AUDIT_GCS_BUCKET"
        value = google_storage_bucket.audit.name
      }

      # Security hardening
      security_context {
        run_as_non_root = true
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 0
        period_seconds        = 5
        failure_threshold     = 12
      }
    }

    max_instance_request_concurrency = var.concurrency
  }

  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }
}

# IAM — allow unauthenticated access (proxy handles auth itself)
resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_unauthenticated ? 1 : 0
  project  = google_cloud_run_v2_service.proxy.project
  location = google_cloud_run_v2_service.proxy.location
  name     = google_cloud_run_v2_service.proxy.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
