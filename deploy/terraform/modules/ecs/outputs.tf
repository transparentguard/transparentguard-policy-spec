output "cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.proxy.name
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the Application Load Balancer (for Route 53 alias records)"
  value       = aws_lb.main.zone_id
}

output "task_definition_arn" {
  description = "ARN of the latest active ECS task definition"
  value       = aws_ecs_task_definition.proxy.arn
}
