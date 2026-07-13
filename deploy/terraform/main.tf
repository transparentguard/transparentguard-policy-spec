terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Uncomment and configure the S3 backend before running in production.
  # Prerequisites:
  #   1. Create an S3 bucket: aws s3 mb s3://YOUR-TFSTATE-BUCKET --region us-east-1
  #   2. Enable versioning:   aws s3api put-bucket-versioning --bucket YOUR-TFSTATE-BUCKET --versioning-configuration Status=Enabled
  #   3. Create a DynamoDB table for state locking:
  #      aws dynamodb create-table --table-name terraform-state-lock \
  #        --attribute-definitions AttributeName=LockID,AttributeType=S \
  #        --key-schema AttributeName=LockID,KeyType=HASH \
  #        --billing-mode PAY_PER_REQUEST
  #   4. Replace placeholders below and uncomment:
  #
  # backend "s3" {
  #   bucket         = "YOUR-TFSTATE-BUCKET"
  #   key            = "transparentguard/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-state-lock"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

module "vpc" {
  source = "./modules/vpc"

  vpc_cidr           = var.vpc_cidr
  project_name       = var.project_name
  environment        = var.environment
  availability_zones = var.availability_zones
  tags               = local.common_tags
}

module "s3_audit" {
  source = "./modules/s3-audit"

  bucket_name_prefix = "${var.project_name}-audit"
  retention_days     = var.audit_retention_days
  project_name       = var.project_name
  environment        = var.environment
  tags               = local.common_tags
}

module "rds" {
  source = "./modules/rds"

  subnet_ids        = module.vpc.private_subnet_ids
  security_group_id = module.vpc.rds_sg_id
  instance_class    = var.db_instance_class
  allocated_storage = var.db_allocated_storage
  db_name           = replace(var.project_name, "-", "_")
  username          = "tgadmin"
  password          = random_password.db_password.result
  project_name      = var.project_name
  environment       = var.environment
  tags              = local.common_tags
}

module "ecs" {
  source = "./modules/ecs"

  cluster_name               = "${var.project_name}-${var.environment}"
  proxy_image                = var.proxy_image
  cpu                        = var.proxy_cpu
  memory                     = var.proxy_memory
  desired_count              = var.proxy_desired_count
  upstream_llm_url           = var.upstream_llm_url
  tg_api_key_ssm_path        = var.tg_api_key_ssm_path
  upstream_api_key_ssm_path  = var.upstream_api_key_ssm_path
  s3_audit_bucket_arn        = module.s3_audit.bucket_arn
  vpc_id                     = module.vpc.vpc_id
  private_subnet_ids         = module.vpc.private_subnet_ids
  alb_sg_id                  = module.vpc.alb_sg_id
  proxy_sg_id                = module.vpc.proxy_sg_id
  certificate_domain         = "${var.environment}.${var.project_name}.example.com"
  project_name               = var.project_name
  environment                = var.environment
  tags                       = local.common_tags
}

resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

resource "aws_ssm_parameter" "db_password" {
  name        = "/${var.project_name}/${var.environment}/db/password"
  description = "RDS master password for ${var.project_name}"
  type        = "SecureString"
  value       = random_password.db_password.result

  tags = local.common_tags
}
