DOCKERCOMPOSE = $(shell which docker-compose)

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
	-rm .docker-build
	${DOCKERCOMPOSE} -f docker-compose.yml build irc
	touch .docker-build

run: .docker-build
	${DOCKERCOMPOSE} up irc

shell: .docker-build
	${DOCKERCOMPOSE} run irc bash

clean:
	-rm -rf node_modules/
	-rm -f .docker-build*

test: .docker-build
	${DOCKERCOMPOSE} run irc node test.js

.PHONY: default clean build run shell test
