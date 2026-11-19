# Guarda-roupa virtual

App (PWA) para fotografar suas roupas e receber sugestões de looks para o dia.

- **Armário**: tire foto (ou escolha várias da galeria) e classifique: tipo, cor, ocasião e espessura. A cor é sugerida automaticamente a partir da foto.
- **Hoje**: o app monta um look combinando **clima** (previsão automática ou escolha manual), **ocasião**, **harmonia de cores** e o que você **usou recentemente**. "Outra sugestão" gera outro look; tocar numa peça troca só ela.
- **Histórico**: registre o que vestiu ("Vou usar hoje") e veja as peças que estão há mais tempo paradas.
- **Privacidade**: fotos e histórico ficam só no seu aparelho (IndexedDB). A única chamada externa é a previsão do tempo (Open-Meteo), com coordenadas arredondadas e só no modo "Auto". Há exportar/importar backup no menu ⋯.

## Rodar

Não há build nem dependências: são arquivos estáticos.

```bash
python3 -m http.server 8000   # ou qualquer servidor estático
# abra http://localhost:8000
```

A câmera, a geolocalização e a instalação como app exigem **HTTPS** (ou `localhost`). Para usar no celular, publique a pasta em qualquer hospedagem estática (Vercel, Netlify, GitHub Pages) e use "Adicionar à tela inicial".

## Como as sugestões funcionam

`js/outfit.js`: monta todas as bases possíveis (cima + baixo, ou vestido), escolhe o melhor calçado/casaco/acessório para cada uma e pontua:

- **Cor** (55%): neutros combinam com tudo; cores vivas só entre análogas ou complementares; penaliza mais de duas cores vivas e pares ruins (preto + marrom, marinho + preto).
- **Peças** (45%): espessura adequada à temperatura e "frescor" (peças usadas ontem pontuam menos; favoritas ganham um bônus).
- Casaco entra quando está frio (≤ 19 °C) ou chovendo.

## Próximos passos possíveis

- Classificar a peça automaticamente (tipo, cor, estampa, ocasião) com um modelo de visão, via função serverless.
- Remover o fundo das fotos para um visual de "manequim".
- Sincronizar entre aparelhos (login + banco na nuvem).
- Listas de viagem/mala e lembrete diário com o look do dia.
