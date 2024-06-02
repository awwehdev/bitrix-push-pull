FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=20

RUN apt-get update && \
    apt-get -y upgrade && \
    apt-get -y install \
        autoconf \
        automake \
        clang-format \
        cloc \
        cmake \
        curl \
        doxygen \
        flex \
        g++ \
        gcc \
        git \
        graphviz \
        lcov \
        libreadline-dev \
        libsasl2-dev \
        libssl-dev \
        libtool \
        mpich \
        ninja-build \
        perl \
        python3-pip \
        qtbase5-dev \
        tzdata \
        valgrind \
        vim-common \
        && \
    apt-get -y autoremove && \
    apt-get clean all

RUN adduser --disabled-password --gecos "" userid_bitrix24
RUN apt-get -y install sudo curl redis-server
RUN mkdir -p /var/run/redis
RUN mkdir -p /usr/local/var/db/redis/
RUN mkdir -p /var/log/push-server/

RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
ENV NVM_DIR=/root/.nvm
RUN . "$NVM_DIR/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "$NVM_DIR/nvm.sh" && nvm alias default v${NODE_VERSION}
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin/:${PATH}"

RUN apt-get install -y nodejs npm

WORKDIR /etc/push-server