output "container_app_url" {
  description = "Container App FQDN (public URL when public_endpoint = true)"
  value       = "https://${azurerm_container_app.proxy.ingress[0].fqdn}"
}

output "container_app_id" {
  description = "Container App resource ID"
  value       = azurerm_container_app.proxy.id
}

output "managed_identity_id" {
  description = "User-assigned Managed Identity resource ID"
  value       = azurerm_user_assigned_identity.proxy.id
}

output "managed_identity_client_id" {
  description = "Managed Identity client ID (for workload identity federation)"
  value       = azurerm_user_assigned_identity.proxy.client_id
}

output "storage_account_name" {
  description = "Azure Storage account name for audit archives"
  value       = azurerm_storage_account.audit.name
}

output "storage_container_name" {
  description = "Azure Blob container name for audit logs"
  value       = azurerm_storage_container.audit.name
}

output "postgres_fqdn" {
  description = "PostgreSQL Flexible Server FQDN"
  value       = azurerm_postgresql_flexible_server.audit.fqdn
  sensitive   = true
}

output "key_vault_uri" {
  description = "Azure Key Vault URI"
  value       = azurerm_key_vault.main.vault_uri
}

output "container_registry_url" {
  description = "Azure Container Registry login server URL (when create_container_registry = true)"
  value       = var.create_container_registry ? azurerm_container_registry.main[0].login_server : ""
}

output "vnet_id" {
  description = "Virtual network resource ID"
  value       = azurerm_virtual_network.main.id
}
