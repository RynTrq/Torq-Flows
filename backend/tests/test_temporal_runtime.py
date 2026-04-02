from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from temporalio.service import TLSConfig

from backend.app.config import Settings
from backend.app.temporal_runtime import (
    build_temporal_client_connect_kwargs,
    build_temporal_tls_config,
)


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


class TemporalRuntimeConfigTests(unittest.TestCase):
    def test_temporal_cloud_api_key_enables_tls(self):
        settings = build_settings(
            temporal_address="demo.abcd.tmprl.cloud:7233",
            temporal_namespace="demo.abcd",
            temporal_api_key="secret-api-key",
        )

        connect_kwargs = build_temporal_client_connect_kwargs(settings)

        self.assertEqual(connect_kwargs["namespace"], "demo.abcd")
        self.assertEqual(connect_kwargs["api_key"], "secret-api-key")
        self.assertTrue(connect_kwargs["tls"])

    def test_local_temporal_defaults_to_plaintext(self):
        settings = build_settings()

        connect_kwargs = build_temporal_client_connect_kwargs(settings)

        self.assertEqual(connect_kwargs["namespace"], "default")
        self.assertIsNone(connect_kwargs["api_key"])
        self.assertFalse(connect_kwargs["tls"])

    def test_mtls_paths_build_explicit_tls_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            cert_path = Path(temp_dir) / "client.pem"
            key_path = Path(temp_dir) / "client.key"
            cert_path.write_text("CERTIFICATE-DATA", encoding="utf-8")
            key_path.write_text("PRIVATE-KEY-DATA", encoding="utf-8")

            settings = build_settings(
                temporal_address="demo.abcd.tmprl.cloud:7233",
                temporal_namespace="demo.abcd",
                temporal_tls_server_name="demo.abcd.tmprl.cloud",
                temporal_tls_client_cert_path=str(cert_path),
                temporal_tls_client_key_path=str(key_path),
            )

            tls_config = build_temporal_tls_config(settings)

            self.assertIsInstance(tls_config, TLSConfig)
            assert isinstance(tls_config, TLSConfig)
            self.assertEqual(tls_config.domain, "demo.abcd.tmprl.cloud")
            self.assertEqual(tls_config.client_cert, b"CERTIFICATE-DATA")
            self.assertEqual(tls_config.client_private_key, b"PRIVATE-KEY-DATA")


if __name__ == "__main__":
    unittest.main()
