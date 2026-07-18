.PHONY: up down build logs broker

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f

broker:
	python -m cortex.broker.server --host 0.0.0.0 --port 7432 --registry ./registry/org_registry.json

seed:
	python -m scenarios.soc_consortium.seed --broker ws://localhost:7432 --node-alpha /tmp/cortex-alpha --node-beta /tmp/cortex-beta

demo:
	python -m scenarios.soc_consortium.demo_run --broker ws://localhost:7432

test:
	python -m pytest tests/ -x --tb=short
