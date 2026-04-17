FROM ubuntu:22.04@sha256:c7eb020043d8fc2ae0793fb35a37bff1cf33f156d4d4b12ccc7f3ef8706c38b1

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install common development tools and runtimes
# - Bun: JavaScript runtime / package manager (web dashboard and tooling)
# - Core: curl, git, vim, build-essential (gcc, make)
# - Python: python3, pip
# - Network: ping, dnsutils
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    wget git vim nano zip \
    build-essential \
    python3 python3-pip \
    sudo \
    iputils-ping dnsutils net-tools \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user 'developer' with UID 1000
# Grant passwordless sudo to simulate a local dev environment (using safe sudoers.d)
RUN useradd -m -s /bin/bash -u 1000 developer && \
    echo "developer ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/developer && \
    chmod 0440 /etc/sudoers.d/developer

# Bun (install as developer so $HOME paths match)
USER developer
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/home/developer/.bun/bin:${PATH}"

WORKDIR /home/developer/workspace

# Default command
CMD ["/bin/bash"]
