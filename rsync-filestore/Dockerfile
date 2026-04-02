FROM alpine:3.21

RUN apk add --no-cache rsync

COPY rsyncd.conf /etc/rsyncd.conf

EXPOSE 873

CMD ["rsync", "--daemon", "--no-detach"]
