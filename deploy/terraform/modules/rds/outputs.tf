output "endpoint" {
  description = "Connection endpoint (host:port) for the RDS PostgreSQL instance"
  value       = aws_db_instance.main.endpoint
}

output "port" {
  description = "Port number for the RDS PostgreSQL instance"
  value       = aws_db_instance.main.port
}

output "db_name" {
  description = "Name of the initial database"
  value       = aws_db_instance.main.db_name
}

output "instance_id" {
  description = "RDS instance identifier"
  value       = aws_db_instance.main.identifier
}
