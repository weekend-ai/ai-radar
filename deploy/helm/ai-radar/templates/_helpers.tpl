{{/* vim: set filetype=mustache: */}}

{{/* Expand the name of the chart. */}}
{{- define "ai-radar.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Create a default fully qualified app name.
Truncated at 63 chars (k8s DNS naming limit).
*/}}
{{- define "ai-radar.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Chart name + version for labels */}}
{{- define "ai-radar.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Common labels (recommended k8s set) */}}
{{- define "ai-radar.labels" -}}
helm.sh/chart: {{ include "ai-radar.chart" . }}
{{ include "ai-radar.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/* Selector labels — must be stable across upgrades */}}
{{- define "ai-radar.selectorLabels" -}}
app.kubernetes.io/name: {{ include "ai-radar.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Per-component labels for web/scheduler */}}
{{- define "ai-radar.web.labels" -}}
{{ include "ai-radar.labels" . }}
app.kubernetes.io/component: web
{{- end -}}
{{- define "ai-radar.web.selectorLabels" -}}
{{ include "ai-radar.selectorLabels" . }}
app.kubernetes.io/component: web
{{- end -}}

{{- define "ai-radar.scheduler.labels" -}}
{{ include "ai-radar.labels" . }}
app.kubernetes.io/component: scheduler
{{- end -}}
{{- define "ai-radar.scheduler.selectorLabels" -}}
{{ include "ai-radar.selectorLabels" . }}
app.kubernetes.io/component: scheduler
{{- end -}}

{{/* ServiceAccount name */}}
{{- define "ai-radar.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "ai-radar.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/* Image ref: repository:tag — tag falls back to AppVersion */}}
{{- define "ai-radar.image" -}}
{{- $tag := default .Chart.AppVersion .Values.image.tag -}}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end -}}

{{/* Secret name — use existing if provided, otherwise generated */}}
{{- define "ai-radar.secretName" -}}
{{- if .Values.secrets.existingSecretName -}}
{{- .Values.secrets.existingSecretName -}}
{{- else -}}
{{- printf "%s-secrets" (include "ai-radar.fullname" .) -}}
{{- end -}}
{{- end -}}

{{/*
Compute DATABASE_URL.
If override is set, use it. Otherwise, build from the embedded postgresql
subchart values + standard Bitnami naming convention.
*/}}
{{- define "ai-radar.databaseUrl" -}}
{{- if .Values.secrets.databaseUrlOverride -}}
{{- .Values.secrets.databaseUrlOverride -}}
{{- else if .Values.postgresql.enabled -}}
{{- $user := .Values.postgresql.auth.username -}}
{{- $pass := .Values.postgresql.auth.password -}}
{{- $db   := .Values.postgresql.auth.database -}}
{{- $host := printf "%s-postgresql" .Release.Name -}}
{{- printf "postgres://%s:%s@%s:5432/%s" $user $pass $host $db -}}
{{- else -}}
{{- fail "Either postgresql.enabled=true or secrets.databaseUrlOverride must be set" -}}
{{- end -}}
{{- end -}}

{{/* REDIS_URL with the same fallback logic */}}
{{- define "ai-radar.redisUrl" -}}
{{- if .Values.secrets.redisUrlOverride -}}
{{- .Values.secrets.redisUrlOverride -}}
{{- else if .Values.redis.enabled -}}
{{- $host := printf "%s-redis-master" .Release.Name -}}
{{- if .Values.redis.auth.enabled -}}
{{- printf "redis://:%s@%s:6379" .Values.redis.auth.password $host -}}
{{- else -}}
{{- printf "redis://%s:6379" $host -}}
{{- end -}}
{{- else -}}
{{- fail "Either redis.enabled=true or secrets.redisUrlOverride must be set" -}}
{{- end -}}
{{- end -}}

{{/* Common env vars injected from the Secret + ConfigMap into web/scheduler */}}
{{- define "ai-radar.commonEnv" -}}
- name: NODE_ENV
  value: production
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "ai-radar.secretName" . }}
      key: DATABASE_URL
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "ai-radar.secretName" . }}
      key: REDIS_URL
- name: OPENAI_API_KEY
  valueFrom:
    secretKeyRef:
      name: {{ include "ai-radar.secretName" . }}
      key: OPENAI_API_KEY
- name: OPENAI_BASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "ai-radar.secretName" . }}
      key: OPENAI_BASE_URL
- name: OPENAI_ENRICH_MODEL
  valueFrom:
    secretKeyRef:
      name: {{ include "ai-radar.secretName" . }}
      key: OPENAI_ENRICH_MODEL
- name: OPENAI_EMBED_MODEL
  valueFrom:
    secretKeyRef:
      name: {{ include "ai-radar.secretName" . }}
      key: OPENAI_EMBED_MODEL
- name: OPENAI_EMBED_DIMENSIONS
  valueFrom:
    secretKeyRef:
      name: {{ include "ai-radar.secretName" . }}
      key: OPENAI_EMBED_DIMENSIONS
{{- end -}}
