# TransparentGuard — Terraform Infrastructure

Production-ready Terraform modules deploying TransparentGuard on AWS with VPC, ECS Fargate, RDS PostgreSQL, and S3 audit logging.

## Architecture

```
Internet → ALB (HTTPS/443) → ECS Fargate (proxy) → Upstream LLM API
                                      ↓
                                RDS PostgreSQL (Multi-AZ)
                                      ↓
                                S3 Audit Bucket (encrypted, versioned)
```

All proxy tasks run in **private subnets** behind NAT gateways. The ALB is in public subnets. RDS is isolated to its own security group, reachable only from proxy tasks.

---

## Prerequisites

| Tool | Minimum Version |
|------|----------------|
| [Terraform](https://developer.hashicorp.com/terraform/downloads) | 1.6+ |
| [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/install-cliv2.html) | 2.x |
| AWS credentials configured | (`aws configure` or env vars) |

Required AWS IAM permissions: EC2, ECS, RDS, S3, IAM, SSM, KMS, CloudWatch, ALB, ACM, Auto Scaling.

---

## Quick Start

### 1. Configure the S3 backend (recommended for production)

```bash
# Create state bucket
aws s3 mb s3://my-tfstate-bucket --region us-east-1
aws s3api put-bucket-versioning \
  --bucket my-tfstate-bucket \
  --versioning-configuration Status=Enabled

# Create DynamoDB lock table
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST

# Then uncomment and fill in the backend block in main.tf
```

### 2. Create required SSM parameters

```bash
# TransparentGuard API key
aws ssm put-parameter \
  --name "/transparentguard/production/tg-api-key" \
  --value "YOUR_TG_API_KEY" \
  --type SecureString \
  --region us-east-1

# Upstream LLM API key (e.g. OpenAI)
aws ssm put-parameter \
  --name "/transparentguard/production/upstream-api-key" \
  --value "YOUR_UPSTREAM_API_KEY" \
  --type SecureString \
  --region us-east-1
```

### 3. Initialize and apply

```bash
cd deploy/terraform

terraform init

terraform plan \
  -var="tg_api_key_ssm_path=/transparentguard/production/tg-api-key" \
  -var="upstream_api_key_ssm_path=/transparentguard/production/upstream-api-key"

terraform apply \
  -var="tg_api_key_ssm_path=/transparentguard/production/tg-api-key" \
  -var="upstream_api_key_ssm_path=/transparentguard/production/upstream-api-key"
```

### 4. Note the outputs

```bash
terraform output alb_dns_name        # Point your CNAME here
terraform output s3_audit_bucket_name
terraform output ecs_cluster_arn
```

---

## Required Variables (no defaults)

| Variable | Description | Example |
|----------|-------------|---------|
| `tg_api_key_ssm_path` | SSM path for the TransparentGuard API key | `/transparentguard/production/tg-api-key` |
| `upstream_api_key_ssm_path` | SSM path for the upstream LLM API key | `/transparentguard/production/upstream-api-key` |

---

## Full Variable Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `aws_region` | `us-east-1` | AWS region |
| `environment` | `production` | Deployment environment |
| `project_name` | `transparentguard` | Project name prefix for resources |
| `vpc_cidr` | `10.0.0.0/16` | VPC CIDR block |
| `availability_zones` | `["us-east-1a","us-east-1b","us-east-1c"]` | AZs to deploy across |
| `audit_retention_days` | `2555` | S3 audit log retention (days, ~7 years) |
| `proxy_image` | `ghcr.io/transparentguard/proxy:latest` | Proxy container image URI |
| `proxy_cpu` | `512` | Fargate task CPU units |
| `proxy_memory` | `1024` | Fargate task memory (MiB) |
| `proxy_desired_count` | `2` | Desired ECS task count |
| `upstream_llm_url` | `https://api.openai.com` | Upstream LLM base URL |
| `db_instance_class` | `db.t4g.medium` | RDS instance type |
| `db_allocated_storage` | `100` | RDS initial storage (GiB) |

---

## Using an Existing VPC

To deploy into an existing VPC instead of creating a new one, remove the `module "vpc"` block from `main.tf` and replace module references with your existing resource IDs:

```hcl
# In main.tf, replace module.vpc.* references directly:
module "rds" {
  source            = "./modules/rds"
  subnet_ids        = ["subnet-aaaa1111", "subnet-bbbb2222", "subnet-cccc3333"]
  security_group_id = "sg-rds-existing"
  # ...
}

module "ecs" {
  source             = "./modules/ecs"
  vpc_id             = "vpc-existing"
  private_subnet_ids = ["subnet-aaaa1111", "subnet-bbbb2222", "subnet-cccc3333"]
  alb_sg_id          = "sg-alb-existing"
  proxy_sg_id        = "sg-proxy-existing"
  # ...
}
```

---

## ACM Certificate & DNS

The ECS module creates an ACM certificate for `var.certificate_domain` using DNS validation. After `terraform apply`:

1. Retrieve the CNAME validation record from the AWS Console → ACM → your certificate.
2. Add it to your DNS provider.
3. Once validated, update your DNS to point the domain CNAME to `terraform output alb_dns_name`.

---

## Verify Deployment

```bash
# Check ECS service is stable
aws ecs describe-services \
  --cluster $(terraform output -raw ecs_cluster_arn) \
  --services $(terraform output -raw ecs_service_name) \
  --query 'services[0].{Status:status,Running:runningCount,Desired:desiredCount}'

# Hit the health endpoint via the ALB
curl -s https://YOUR_DOMAIN/health

# Tail proxy logs
aws logs tail /ecs/transparentguard-proxy --follow

# Check audit bucket
aws s3 ls s3://$(terraform output -raw s3_audit_bucket_name) --recursive | head -20
```

---

## Security Notes

- All traffic encrypted in transit (HTTPS only; HTTP redirects to HTTPS).
- RDS encrypted at rest with a customer-managed KMS key; key rotation enabled.
- S3 audit bucket enforces HTTPS-only access via bucket policy.
- API keys stored in SSM Parameter Store as `SecureString`; never in environment variables or Terraform state.
- ECS tasks run in private subnets with no public IPs.
- RDS is Multi-AZ with 35-day backup retention and deletion protection enabled.

---

## Destroy

```bash
# Deletion protection must be disabled before destroy
aws rds modify-db-instance \
  --db-instance-identifier transparentguard-production-db \
  --no-deletion-protection \
  --apply-immediately

terraform destroy \
  -var="tg_api_key_ssm_path=/transparentguard/production/tg-api-key" \
  -var="upstream_api_key_ssm_path=/transparentguard/production/upstream-api-key"
```
