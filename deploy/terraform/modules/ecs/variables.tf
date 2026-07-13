variable "cluster_name" {
  description = "Name of the ECS cluster"
  type        = string
}

variable "proxy_image" {
  description = "Docker image URI for the proxy container"
  type        = string
}

variable "cpu" {
  description = "CPU units for the Fargate task (1 vCPU = 1024)"
  type        = number
}

variable "memory" {
  description = "Memory (MiB) for the Fargate task"
  type        = number
}

variable "desired_count" {
  description = "Desired number of ECS task instances"
  type        = number
}

variable "upstream_llm_url" {
  description = "Base URL of the upstream LLM API"
  type        = string
}

variable "tg_api_key_ssm_path" {
  description = "SSM Parameter Store path for the TransparentGuard API key"
  type        = string
}

variable "upstream_api_key_ssm_path" {
  description = "SSM Parameter Store path for the upstream LLM API key"
  type        = string
}

variable "s3_audit_bucket_arn" {
  description = "ARN of the S3 audit log bucket"
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "alb_sg_id" {
  description = "Security group ID of the ALB"
  type        = string
}

variable "proxy_sg_id" {
  description = "Security group ID for the proxy ECS tasks"
  type        = string
}

variable "certificate_domain" {
  description = "Domain name for the ACM certificate (e.g. production.transparentguard.example.com)"
  type        = string
}

variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Deployment environment"
  type        = string
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
