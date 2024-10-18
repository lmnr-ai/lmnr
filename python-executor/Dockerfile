# https://stackoverflow.com/questions/53835198/integrating-python-poetry-with-docker/57886655#57886655
FROM python:3.12.3-slim AS builder
RUN apt-get update && \
    apt-get install --no-install-suggests --no-install-recommends --yes pipx
ENV PATH="/root/.local/bin:${PATH}"
RUN pipx install poetry==1.8.3
RUN pipx inject poetry poetry-plugin-bundle
COPY . .
# --python defaults /usr/bin/python3, which works correct for "python:3.12.3"
# but is different for "python:3.12.3-slim", so we specify it
RUN poetry bundle venv --python=/usr/local/bin/python3 --only=main /venv

EXPOSE 8811

FROM python:3.12.3-slim
COPY --from=builder /venv /venv
COPY ./python_executor/ /python_executor/
WORKDIR /python_executor
ADD docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh
# TODO: Add USER without root permissions
CMD ["/docker-entrypoint.sh"]
