data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# ─── ECS Cluster ────────────────────────────────────────────────────────────────

resource "aws_ecs_cluster" "main" {
  name = var.cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(var.tags, {
    Name = var.cluster_name
  })
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name       = aws_ecs_cluster.main.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
  }
}

# ─── CloudWatch Logs ─────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "proxy" {
  name              = "/ecs/transparentguard-proxy"
  retention_in_days = 90

  tags = merge(var.tags, {
    Name = "/ecs/transparentguard-proxy"
  })
}

# ─── IAM: Task Execution Role ────────────────────────────────────────────────────

data "aws_iam_policy_document" "ecs_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "task_execution_role" {
  name               = "${var.project_name}-${var.environment}-ecs-execution-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "task_execution_role_managed" {
  role       = aws_iam_role.task_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "task_execution_ssm" {
  statement {
    sid    = "GetSSMParameters"
    effect = "Allow"

    actions = [
      "ssm:GetParameter",
      "ssm:GetParameters",
    ]

    resources = [
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.tg_api_key_ssm_path}",
      "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.upstream_api_key_ssm_path}",
    ]
  }

  statement {
    sid    = "DecryptSSMParameters"
    effect = "Allow"

    actions = ["kms:Decrypt"]

    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${data.aws_region.current.name}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "task_execution_ssm" {
  name   = "${var.project_name}-${var.environment}-ecs-execution-ssm"
  role   = aws_iam_role.task_execution_role.id
  policy = data.aws_iam_policy_document.task_execution_ssm.json
}

# ─── IAM: Task Role ──────────────────────────────────────────────────────────────

resource "aws_iam_role" "task_role" {
  name               = "${var.project_name}-${var.environment}-ecs-task-role"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume_role.json

  tags = var.tags
}

data "aws_iam_policy_document" "task_role_s3" {
  statement {
    sid    = "PutAuditLogs"
    effect = "Allow"

    actions = [
      "s3:PutObject",
      "s3:PutObjectAcl",
    ]

    resources = ["${var.s3_audit_bucket_arn}/*"]
  }

  statement {
    sid    = "ListAuditBucket"
    effect = "Allow"

    actions = ["s3:ListBucket"]

    resources = [var.s3_audit_bucket_arn]
  }
}

resource "aws_iam_role_policy" "task_role_s3" {
  name   = "${var.project_name}-${var.environment}-ecs-task-s3-audit"
  role   = aws_iam_role.task_role.id
  policy = data.aws_iam_policy_document.task_role_s3.json
}

# ─── ECS Task Definition ─────────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "proxy" {
  family                   = "${var.project_name}-${var.environment}-proxy"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.task_execution_role.arn
  task_role_arn            = aws_iam_role.task_role.arn

  container_definitions = jsonencode([
    {
      name      = "proxy"
      image     = var.proxy_image
      essential = true

      portMappings = [
        {
          containerPort = 8080
          hostPort      = 8080
          protocol      = "tcp"
        }
      ]

      environment = [
        {
          name  = "PORT"
          value = "8080"
        },
        {
          name  = "UPSTREAM_URL"
          value = var.upstream_llm_url
        },
        {
          name  = "ENVIRONMENT"
          value = var.environment
        },
        {
          name  = "S3_AUDIT_BUCKET"
          value = split(":::", var.s3_audit_bucket_arn)[1]
        }
      ]

      secrets = [
        {
          name      = "UPSTREAM_API_KEY"
          valueFrom = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.upstream_api_key_ssm_path}"
        },
        {
          name      = "TG_API_KEY"
          valueFrom = "arn:aws:ssm:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:parameter${var.tg_api_key_ssm_path}"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.proxy.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "proxy"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }

      readonlyRootFilesystem = false
      user                   = "1000"
    }
  ])

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-proxy"
  })
}

# ─── ACM Certificate ─────────────────────────────────────────────────────────────

resource "aws_acm_certificate" "proxy" {
  domain_name       = var.certificate_domain
  validation_method = "DNS"

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-cert"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ─── Application Load Balancer ───────────────────────────────────────────────────

resource "aws_lb" "main" {
  name               = "${var.project_name}-${var.environment}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.private_subnet_ids

  enable_deletion_protection = true
  enable_http2               = true

  access_logs {
    bucket  = split(":::", var.s3_audit_bucket_arn)[1]
    prefix  = "alb-access-logs"
    enabled = true
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-alb"
  })
}

resource "aws_lb_target_group" "proxy" {
  name        = "${var.project_name}-${var.environment}-proxy-tg"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health"
    protocol            = "HTTP"
    port                = "traffic-port"
    healthy_threshold   = 3
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-proxy-tg"
  })
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-http-listener"
  })
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.proxy.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.proxy.arn
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-https-listener"
  })

  depends_on = [aws_acm_certificate.proxy]
}

resource "aws_lb_listener_certificate" "proxy" {
  listener_arn    = aws_lb_listener.https.arn
  certificate_arn = aws_acm_certificate.proxy.arn
}

# ─── ECS Service ─────────────────────────────────────────────────────────────────

resource "aws_ecs_service" "proxy" {
  name            = "${var.project_name}-${var.environment}-proxy"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.proxy.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.proxy_sg_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.proxy.arn
    container_name   = "proxy"
    container_port   = 8080
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_controller {
    type = "ECS"
  }

  health_check_grace_period_seconds = 60

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  tags = merge(var.tags, {
    Name = "${var.project_name}-${var.environment}-proxy-service"
  })

  depends_on = [
    aws_lb_listener.https,
    aws_iam_role_policy_attachment.task_execution_role_managed,
  ]
}

# ─── Auto Scaling ─────────────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "proxy" {
  max_capacity       = var.desired_count * 4
  min_capacity       = var.desired_count
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.proxy.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  depends_on = [aws_ecs_service.proxy]
}

resource "aws_appautoscaling_policy" "proxy_cpu" {
  name               = "${var.project_name}-${var.environment}-proxy-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.proxy.resource_id
  scalable_dimension = aws_appautoscaling_target.proxy.scalable_dimension
  service_namespace  = aws_appautoscaling_target.proxy.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }

    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}
