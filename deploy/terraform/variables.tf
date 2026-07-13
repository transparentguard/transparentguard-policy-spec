variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment (e.g. production, staging)"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Name of the project, used as a prefix for resource naming"
  type        = string
  default     = "transparentguard"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "List of availability zones to deploy resources across"
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

variable "audit_retention_days" {
  description = "Number of days to retain audit logs in S3 before expiration"
  type        = number
  default     = 2555 # 7 years
}

variable "proxy_image" {
  description = "Docker image URI for the TransparentGuard proxy container"
  type        = string
  default     = "ghcr.io/transparentguard/proxy:latest"
}

variable "proxy_cpu" {
  description = "CPU units to allocate to the proxy Fargate task (1 vCPU = 1024)"
  type        = number
  default     = 512
}

variable "proxy_memory" {
  description = "Memory (MiB) to allocate to the proxy Fargate task"
  type        = number
  default     = 1024
}

variable "proxy_desired_count" {
  description = "Desired number of proxy ECS task instances"
  type        = number
  default     = 2
}

variable "upstream_llm_url" {
  description = "Base URL of the upstream LLM API to proxy requests to"
  type        = string
  default     = "https://api.openai.com"
}

variable "tg_api_key_ssm_path" {
  description = "AWS SSM Parameter Store path for the TransparentGuard API key (SecureString)"
  type        = string
}

variable "upstream_api_key_ssm_path" {
  description = "AWS SSM Parameter Store path for the upstream LLM API key (SecureString)"
  type        = string
}

variable "db_instance_class" {
  description = "RDS instance class for the PostgreSQL database"
  type        = string
  default     = "db.t4g.medium"
}

variable "db_allocated_storage" {
  description = "Initial allocated storage (GiB) for the RDS instance"
  type        = number
  default     = 100
}
