from __future__ import annotations

import unittest

from backend.app.config import Settings, validate_settings


def build_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "production",
        "database_url": "postgresql://postgres:postgres@localhost:5432/torqFlows",
        "database_ssl": "false",
        "temporal_address": "localhost:7233",
        "temporal_namespace": "default",
        "temporal_api_key": "",
        "temporal_tls_server_name": "",
        "temporal_tls_server_root_ca_cert_data": "",
        "temporal_tls_server_root_ca_cert_path": "",
        "temporal_tls_client_cert_data": "",
        "temporal_tls_client_cert_path": "",
        "temporal_tls_client_key_data": "",
        "temporal_tls_client_key_path": "",
        "temporal_task_queue": "torq-flows-workflows",
        "api_request_timeout_seconds": 30,
    }
    values.update(overrides)
    return Settings(**values)


class SettingsValidationTests(unittest.TestCase):
    def test_temporal_cloud_api_key_config_is_valid(self):
        settings = build_settings(
            temporal_address="demo.abcd.tmprl.cloud:7233",
            temporal_namespace="demo.abcd",
            temporal_api_key="secret-api-key",
        )

        validate_settings(settings)

    def test_temporal_cloud_requires_authentication(self):
        settings = build_settings(
            temporal_address="demo.abcd.tmprl.cloud:7233",
            temporal_namespace="demo.abcd",
        )

        with self.assertRaisesRegex(
            RuntimeError,
            "Temporal Cloud requires TEMPORAL_API_KEY or mTLS client certificate credentials.",
        ):
            validate_settings(settings)


if __name__ == "__main__":
    unittest.main()
