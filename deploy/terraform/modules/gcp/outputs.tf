output "service_url" {
  description = "Cloud Run service URL (public endpoint)"
  value       = google_cloud_run_v2_service.proxy.uri
}

output "service_account_email" {
  description = "Service account email used by the Cloud Run service"
  value       = google_service_account.proxy.email
}

output "audit_bucket_name" {
  description = "GCS bucket name for audit JSONL archive"
  value       = google_storage_bucket.audit.name
}

output "audit_bucket_url" {
  description = "GCS bucket gsutil URI"
  value       = "gs://${google_storage_bucket.audit.name}"
}

output "db_instance_name" {
  description = "Cloud SQL instance name"
  value       = google_sql_database_instance.audit.name
}

output "db_private_ip" {
  description = "Cloud SQL instance private IP address"
  value       = google_sql_database_instance.audit.private_ip_address
  sensitive   = true
}

output "vpc_id" {
  description = "VPC network ID"
  value       = google_compute_network.vpc.id
}

output "vpc_connector_id" {
  description = "Serverless VPC Access connector ID"
  value       = google_vpc_access_connector.serverless.id
}

output "artifact_registry_url" {
  description = "Artifact Registry Docker repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.proxy.repository_id}"
}
