// A small config used by the file-mode page tests.
export const SAMPLE = `_format_version: "3.0"
services:
- name: billing-service
  host: billing.internal
  port: 8080
  routes:
  - name: billing-route
    paths:
    - /billing
    methods:
    - GET
    plugins:
    - name: key-auth
      enabled: true
      protocols:
      - http
      config:
        key_names:
        - apikey
  - paths:
    - /refunds
- name: reporting-service
  host: reporting.internal
  port: 9090
  plugins:
  - name: cors
consumers:
- username: alice
  custom_id: cust-1
  keyauth_credentials:
  - key: abc123key
- username: admin-user
  basicauth_credentials:
  - username: admin-user
    password: 08f95a79a7b8e335fecb65e0a7ae65aec6780af7
plugins:
- name: rate-limiting
  enabled: true
  protocols:
  - http
  config:
    minute: 100
- name: key-auth
  enabled: true
  protocols:
  - http
  config:
    key_names:
    - apikey
`
