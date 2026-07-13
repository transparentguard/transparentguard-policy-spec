{{/*
Expand the name of the chart.
*/}}
{{- define "transparentguard-proxy.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "transparentguard-proxy.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label.
*/}}
{{- define "transparentguard-proxy.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "transparentguard-proxy.labels" -}}
helm.sh/chart: {{ include "transparentguard-proxy.chart" . }}
{{ include "transparentguard-proxy.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "transparentguard-proxy.selectorLabels" -}}
app.kubernetes.io/name: {{ include "transparentguard-proxy.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Image tag — defaults to Chart.AppVersion.
*/}}
{{- define "transparentguard-proxy.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion }}
{{- printf "%s:%s" .Values.image.repository $tag }}
{{- end }}

{{/*
Policy source — ociRef takes precedence over content.
*/}}
{{- define "transparentguard-proxy.policyArg" -}}
{{- if .Values.policy.ociRef }}
{{- .Values.policy.ociRef }}
{{- else }}
{{- "/etc/tg/policy.yaml" }}
{{- end }}
{{- end }}
