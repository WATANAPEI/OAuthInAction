FROM node:12.19
RUN useradd --user-group --create-home --shell /bin/false app

ENV HOME=/home/app/
WORKDIR $HOME

# COPY package*.json $HOME
# COPY . $HOME/traffik

# RUN npx create-react-app traffik --template typescript
# RUN chown -R app:app $HOME/*

# CMD ["tail", "f", "/dev/null"]