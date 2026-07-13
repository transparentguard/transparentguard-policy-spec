output "bucket_name" {
  description = "Name of the S3 audit log bucket"
  value       = aws_s3_bucket.audit.id
}

output "bucket_arn" {
  description = "ARN of the S3 audit log bucket"
  value       = aws_s3_bucket.audit.arn
}

output "bucket_domain_name" {
  description = "Regional domain name of the S3 audit log bucket"
  value       = aws_s3_bucket.audit.bucket_regional_domain_name
}
