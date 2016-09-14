default: help
	@echo ""
	@echo "You need to specify a subcommand."
	@exit 1

help:
	@echo "build         - build docker containers for dev"
	@echo "run           - docker-compose up the entire system for dev"
	@echo ""
	@echo "clean         - remove all build, test, coverage and Python artifacts"
	@echo "test          - run tests against local files"

.docker-build:
	${MAKE} build

build:
	docker build -t standup_irc .
	touch .docker-build
	touch .env

run: .docker-build
	docker run --env-file .env_dev --env-file .env -v "$PWD:/app" standup_irc

lint: .docker-build
	docker run --env-file .env_dev --env-file .env -v "$PWD:/app" standup_irc jshint *.js

shell: .docker-build
	docker run -it --env-file .env_dev --env-file .env -v "$PWD:/app" standup_irc bash

clean:
	-rm -rf node_modules/
	-rm -f .docker-build*

test: .docker-build
	docker run --env-file .env_dev --env-file .env -v "$PWD:/app" standup_irc node test.js

test-image: .docker-build
	docker run --env-file .env_dev --env-file .env standup_irc node test.js

lint-image: .docker-build
	docker run --env-file .env_dev --env-file .env standup_irc jshint *.js

.PHONY: default clean build run shell test test-image lint-image
