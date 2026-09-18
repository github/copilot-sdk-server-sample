# Minimal image used to run one container per agent session.
#
# Based on stock Alpine with just the packages the agent's shell tool needs
# (bash, python3, curl). No other customization, so it stays tiny and boots
# in ~1-2 seconds.
FROM alpine:3.21

RUN apk add --no-cache bash python3 curl

# Kept running with a no-op process; commands are executed in it via
# `docker exec` (see ../src/api/docker/sessionContainer.ts).
CMD ["sleep", "infinity"]
