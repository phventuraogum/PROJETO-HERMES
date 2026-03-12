import importlib
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest import mock


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


class DbPoolTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.db_path = str(Path(self.tmpdir.name) / "db-pool-test.duckdb")
        self.prev_env = {
            "ENVIRONMENT": os.environ.get("ENVIRONMENT"),
            "HERMES_DUCKDB_PATH": os.environ.get("HERMES_DUCKDB_PATH"),
        }
        os.environ["ENVIRONMENT"] = "development"
        os.environ["HERMES_DUCKDB_PATH"] = self.db_path

        self.db_pool = importlib.import_module("api.db_pool")
        importlib.reload(self.db_pool)

    def tearDown(self):
        try:
            self.db_pool.close_all_connections()
        finally:
            for key, value in self.prev_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            self.tmpdir.cleanup()

    def test_write_then_read_succeeds_with_fresh_connections(self):
        with self.db_pool.get_connection(read_only=False) as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS smoke (id INTEGER)")
            conn.execute("DELETE FROM smoke")
            conn.execute("INSERT INTO smoke VALUES (1)")

        with self.db_pool.get_connection(read_only=True) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM smoke").fetchone()[0], 1)

    def test_writer_waits_for_active_reader(self):
        with self.db_pool.get_connection(read_only=False) as conn:
            conn.execute("CREATE TABLE IF NOT EXISTS smoke (id INTEGER)")
            conn.execute("DELETE FROM smoke")

        reader_entered = threading.Event()
        release_reader = threading.Event()
        writer_finished = threading.Event()

        def reader_job():
            with self.db_pool.get_connection(read_only=True) as conn:
                reader_entered.set()
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM smoke").fetchone()[0], 0)
                release_reader.wait(2)

        def writer_job():
            with self.db_pool.get_connection(read_only=False) as conn:
                conn.execute("INSERT INTO smoke VALUES (2)")
            writer_finished.set()

        reader = threading.Thread(target=reader_job)
        writer = threading.Thread(target=writer_job)
        reader.start()
        self.assertTrue(reader_entered.wait(1))

        writer.start()
        time.sleep(0.2)
        self.assertFalse(writer_finished.is_set())

        release_reader.set()
        reader.join(2)
        writer.join(2)
        self.assertTrue(writer_finished.is_set())

        with self.db_pool.get_connection(read_only=True) as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM smoke").fetchone()[0], 1)

    def test_retries_write_connection_on_lock_conflict(self):
        Path(self.db_path).touch()
        fake_conn = mock.Mock()
        fake_conn.execute.return_value = None
        attempts = []

        def fake_connect(*_args, **kwargs):
            attempts.append(kwargs.get("read_only"))
            if len(attempts) == 1:
                raise RuntimeError('IO Error: Could not set lock on file "/data/cnpj.duckdb"')
            return fake_conn

        with mock.patch.object(self.db_pool.duckdb, "connect", side_effect=fake_connect), mock.patch.object(
            self.db_pool.time,
            "sleep",
            return_value=None,
        ):
            conn = self.db_pool._open_connection(read_only=False)

        self.assertIs(conn, fake_conn)
        self.assertEqual(attempts, [False, False])


if __name__ == "__main__":
    unittest.main()
