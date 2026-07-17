variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
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

variable "private_subnet_cidr" {
  description = "CIDR range for the private VPC subnet"
  type        = string
  default     = "10.0.1.0/24"
}

variable "vpc_connector_cidr" {
  description = "CIDR range for the Serverless VPC Access connector (/28 required)"
  type        = string
  default     = "10.8.0.0/28"
}

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-g1-small"
}

variable "gcs_location" {
  description = "GCS bucket location (region or multi-region, e.g. EU, US, europe-west4)"
  type        = string
  default     = "US"
}

variable "audit_retention_days" {
  description = "Number of days to retain audit objects in GCS before deletion"
  type        = number
  default     = 365
}

variable "min_instances" {
  description = "Minimum Cloud Run instances (0 = scale to zero)"
  type        = number
  default     = 1
}

variable "max_instances" {
  description = "Maximum Cloud Run instances"
  type        = number
  default     = 10
}

variable "cpu" {
  description = "CPU limit per Cloud Run instance (e.g. '1', '2')"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory limit per Cloud Run instance (e.g. '512Mi', '1Gi')"
  type        = string
  default     = "512Mi"
}

variable "concurrency" {
  description = "Maximum concurrent requests per Cloud Run instance"
  type        = number
  default     = 80
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated Cloud Run invocations (proxy handles its own auth)"
  type        = bool
  default     = true
}

variable "labels" {
  description = "Additional labels to apply to all resources"
  type        = map(string)
  default     = {}
}
