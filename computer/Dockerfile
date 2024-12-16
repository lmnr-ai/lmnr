# Use Ubuntu as base image
FROM ubuntu:22.04

# Avoid prompts from apt
ENV DEBIAN_FRONTEND=noninteractive

# Set required environment variables
ENV USER=root
ENV HOME=/root
ENV DISPLAY=:1
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# Install required packages
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    xfce4 \
    xfce4-goodies \
    tightvncserver \
    wget \
    net-tools \
    sudo \
    dbus-x11 \
    x11-xserver-utils \
    xfonts-base \
    autocutsel \
    chromium-browser \
    chromium-browser-l10n \
    chromium-codecs-ffmpeg \
    fonts-liberation \
    fonts-noto \
    fonts-noto-cjk \
    fonts-noto-color-emoji \
    locales \
    pulseaudio \
    bzip2 \
    libgtk-3-0 \
    libdbus-glib-1-2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Download and install Firefox
RUN wget -O firefox.tar.bz2 "https://download.mozilla.org/?product=firefox-latest&os=linux64&lang=en-US" && \
    tar xjf firefox.tar.bz2 -C /opt/ && \
    rm firefox.tar.bz2 && \
    ln -s /opt/firefox/firefox /usr/local/bin/firefox

# Generate locale
RUN locale-gen en_US.UTF-8

# Set up VNC password and directory
RUN mkdir -p /root/.vnc
RUN echo "password" | vncpasswd -f > /root/.vnc/passwd
RUN chmod 600 /root/.vnc/passwd

# Copy VNC xstartup file
COPY xstartup /root/.vnc/xstartup
RUN chmod +x /root/.vnc/xstartup

# Install Python requirements
COPY requirements.txt /requirements.txt
RUN pip3 install -r requirements.txt

# Copy Python server code
COPY server.py /server.py

# Create desktop shortcuts
RUN mkdir -p /root/Desktop
RUN echo "[Desktop Entry]\n\
    Version=1.0\n\
    Type=Application\n\
    Name=Firefox\n\
    Comment=Browse the Web\n\
    Exec=/usr/local/bin/firefox %u\n\
    Icon=/opt/firefox/browser/chrome/icons/default/default128.png\n\
    Terminal=false\n\
    Categories=Network;WebBrowser;" > /root/Desktop/firefox.desktop

RUN echo "[Desktop Entry]\n\
    Type=Application\n\
    Name=Chromium\n\
    Comment=Browse the Web\n\
    Exec=chromium-browser %U\n\
    Icon=chromium-browser\n\
    Terminal=false\n\
    Categories=Network;WebBrowser;" > /root/Desktop/chromium.desktop

RUN chmod +x /root/Desktop/*.desktop

# Expose VNC port and Python server port
EXPOSE 5901 8080

# Start VNC server and Python server
CMD ["bash", "-c", "vncserver :1 -geometry 1280x800 -depth 24 && python3 /server.py"]