DOCKER_IMG = standup_irc
DOCKER = $(shell which docker)

default: help
	@echo ""
	@echo "You need to specify a subcommand."
	@exit 1

help:
	@echo "build         - build docker image for dev"
	@echo "run           - docker run the bot for dev"
	@echo ""
	@echo "clean         - remove all build, test, coverage and nodejs artifacts"
	@echo "shell         - open a bash shell in the docker container"
	@echo "test          - run tests against local files"
	@echo "lint          - run jshint against local files"
	@echo "test-image    - run tests in the docker image"
	@echo "lint-image    - run jshint in the docker image"

.docker-build:
	${MAKE} build

build:
	-rm -f .docker-build
	${DOCKER} build -t ${DOCKER_IMG} .
	touch .docker-build
	touch .env

run: .docker-build
	${DOCKER} run --env-file .env_dev --env-file .env -v "$PWD:/app" ${DOCKER_IMG}

lint: .docker-build
	${DOCKER} run --env-file .env_dev --env-file .env -v "$PWD:/app" ${DOCKER_IMG} jshint *.js

shell: .docker-build
	${DOCKER} run -it --env-file .env_dev --env-file .env -v "$PWD:/app" ${DOCKER_IMG} bash

clean:
	-rm -rf node_modules/
	-rm -f .docker-build*

test: .docker-build
	${DOCKER} run --env-file .env_dev --env-file .env -v "$PWD:/app" ${DOCKER_IMG} node test.js

test-image: .docker-build
	${DOCKER} run --env-file .env_dev --env-file .env ${DOCKER_IMG} node test.js

lint-image: .docker-build
	${DOCKER} run --env-file .env_dev --env-file .env ${DOCKER_IMG} jshint *.js

.PHONY: default clean build run shell test test-image lint-image
