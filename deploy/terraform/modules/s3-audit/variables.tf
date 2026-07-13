variable "bucket_name_prefix" {
  description = "Prefix for the S3 audit bucket name (a unique suffix is appended)"
  type        = string
}

variable "retention_days" {
  description = "Number of days before audit log objects expire"
  type        = number
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
