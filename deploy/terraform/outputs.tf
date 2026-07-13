output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer — point your CNAME here"
  value       = module.ecs.alb_dns_name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = module.ecs.cluster_arn
}

output "ecs_service_name" {
  description = "Name of the ECS service running the proxy"
  value       = module.ecs.service_name
}

output "s3_audit_bucket_name" {
  description = "Name of the S3 bucket storing audit logs"
  value       = module.s3_audit.bucket_name
}

output "rds_endpoint" {
  description = "Connection endpoint for the RDS PostgreSQL instance"
  value       = module.rds.endpoint
  sensitive   = true
}

output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "proxy_security_group_id" {
  description = "ID of the security group attached to the proxy ECS tasks"
  value       = module.vpc.proxy_sg_id
}
