import os
from rq import Worker, Queue
from redis import Redis


def main():
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    conn = Redis.from_url(redis_url)

    # RQ 2.x não precisa mais de Connection context manager
    q = Queue("hermes", connection=conn)
    w = Worker([q], connection=conn)
    w.work(with_scheduler=False)


if __name__ == "__main__":
    main()

