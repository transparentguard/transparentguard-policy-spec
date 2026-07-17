variable "resource_group_name" {
  description = "Name of the existing Azure Resource Group to deploy into"
  type        = string
}

variable "location" {
  description = "Azure region for all resources (e.g. 'westeurope', 'eastus')"
  type        = string
  default     = "westeurope"
}

variable "environment" {
  description = "Deployment environment (production, staging, development)"
  type        = string
  default     = "production"
}

variable "image" {
  description = "Container image reference (e.g. ghcr.io/transparentguard/proxy:v1.0.0)"
  type        = string
}

variable "upstream_url" {
  description = "Base URL of the upstream LLM API"
  type        = string
  default     = "https://api.openai.com"
}

variable "upstream_api_key" {
  description = "API key for the upstream LLM provider"
  type        = string
  sensitive   = true
}

variable "tg_api_key" {
  description = "TransparentGuard API key for paid-tier features (leave empty for free tier)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "vnet_address_space" {
  description = "CIDR for the virtual network address space"
  type        = string
  default     = "10.0.0.0/16"
}

variable "container_apps_subnet_cidr" {
  description = "CIDR for the Container Apps subnet (/23 minimum required)"
  type        = string
  default     = "10.0.0.0/23"
}

variable "db_subnet_cidr" {
  description = "CIDR for the PostgreSQL Flexible Server subnet"
  type        = string
  default     = "10.0.4.0/24"
}

variable "db_sku_name" {
  description = "Azure PostgreSQL Flexible Server SKU (e.g. 'B_Standard_B1ms', 'GP_Standard_D2s_v3')"
  type        = string
  default     = "B_Standard_B1ms"
}

variable "db_storage_mb" {
  description = "PostgreSQL storage size in MB"
  type        = number
  default     = 32768
}

variable "audit_retention_days" {
  description = "Number of days to retain audit blob objects before deletion"
  type        = number
  default     = 365
}

variable "create_container_registry" {
  description = "Create an Azure Container Registry in this resource group"
  type        = bool
  default     = false
}

variable "public_endpoint" {
  description = "Expose the Container App via a public external endpoint"
  type        = bool
  default     = true
}

variable "min_replicas" {
  description = "Minimum Container App replicas (0 = scale to zero)"
  type        = number
  default     = 1
}

variable "max_replicas" {
  description = "Maximum Container App replicas"
  type        = number
  default     = 10
}

variable "cpu" {
  description = "CPU allocation per replica (e.g. 0.5, 1.0)"
  type        = number
  default     = 0.5
}

variable "memory" {
  description = "Memory allocation per replica (e.g. '1Gi', '512Mi')"
  type        = string
  default     = "1Gi"
}

variable "scale_concurrent_requests" {
  description = "Number of concurrent HTTP requests per replica before scaling out"
  type        = number
  default     = 50
}

variable "tags" {
  description = "Additional Azure tags to apply to all resources"
  type        = map(string)
  default     = {}
}
