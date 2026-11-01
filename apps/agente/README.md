# Agente da obra

Programa que roda num computador **na rede da obra**, pede a foto às câmeras Intelbras (ou ao NVR)
pela rede local e envia para a plataforma por HTTPS.

- **Não precisa abrir porta** no roteador: o agente só faz conexões de saída. A câmera não fica
  exposta na internet.
- Se a internet cair, as fotos ficam numa fila no disco e sobem quando ela voltar (até 500 fotos).
- A senha das câmeras vem da plataforma e fica só na memória; não é gravada no disco.
- Horários, câmeras e senhas são configurados na plataforma (Câmeras → Configurar). O agente busca a
  configuração a cada 30 segundos, então mudanças valem quase na hora.

## Do que precisa

- Um computador ligado 24 horas na mesma rede das câmeras: Raspberry Pi 4 ou 5 (fonte oficial e
  cartão de 32 GB), mini PC ou o PC do escritório da obra. De preferência num nobreak.
- O **token do agente**, gerado na plataforma em Câmeras → Configurar → "Cadastrar agente".
  Ele aparece uma vez só: copie na hora.
- Node.js 20 ou mais novo, ou Docker.
- FFmpeg, só se alguma câmera usar endereço `rtsp://` (no Docker já vem).

## Instalar com Docker (Raspberry Pi ou PC com Linux)

```bash
docker build -t agente-obra apps/agente
```

```bash
docker run -d --restart unless-stopped --name agente-obra \
  -e AGENTE_TOKEN=obra_cole_o_token_aqui \
  -v agente-dados:/dados agente-obra
```

Para ver o que ele está fazendo:

```bash
docker logs -f agente-obra
```

## Instalar sem Docker (Linux, Windows ou Mac)

Com o Node.js instalado, na pasta `apps/agente`:

```bash
AGENTE_TOKEN=obra_cole_o_token_aqui node src/index.js
```

No Windows (PowerShell):

```powershell
$env:AGENTE_TOKEN="obra_cole_o_token_aqui"; node src/index.js
```

Para ligar sozinho quando o computador reiniciar: no Linux, um serviço do systemd; no Windows, o
Agendador de Tarefas ("Ao iniciar o computador") ou o NSSM.

## Descobrir o endereço da foto de cada câmera

Antes de cadastrar na plataforma, teste no próprio computador do agente. Se aparecer
`✔ Foto recebida`, o endereço, o usuário e a senha estão certos.

```bash
node src/testar-camera.js "http://192.168.1.108/cgi-bin/snapshot.cgi" usuario senha
```

| Onde a câmera está ligada | Endereço da foto |
| --- | --- |
| Câmera IP Intelbras direto no roteador | `http://IP-DA-CAMERA/cgi-bin/snapshot.cgi` |
| Câmera ligada num NVR Intelbras | `http://IP-DO-NVR/cgi-bin/snapshot.cgi?channel=N` (N = canal da câmera no NVR) |
| Câmera que só entrega vídeo (RTSP) | `rtsp://IP:554/cam/realmonitor?channel=1&subtype=0` (precisa de FFmpeg) |

O IP aparece no app Intelbras (ISIC, Mibo), no próprio NVR (Menu → Rede) ou na lista de
aparelhos do roteador. Fixe o IP da câmera ou do NVR no roteador (reserva de DHCP), senão ele
pode mudar e a foto para de chegar.

**Crie um usuário só de visualização** na câmera ou no NVR para a plataforma. Não use o `admin`.

## Variáveis

| Variável | Para quê | Padrão |
| --- | --- | --- |
| `AGENTE_TOKEN` | Token gerado na plataforma (obrigatório) | |
| `PLATAFORMA_URL` | Endereço da função `agente-cameras` | o do projeto |
| `PASTA_DADOS` | Onde ficam a fila e o estado | `./dados` (`/dados` no Docker) |
| `INTERVALO_SEG` | De quanto em quanto tempo conversa com a plataforma | `30` (mínimo 15) |
| `FFMPEG` | Caminho do FFmpeg, se não estiver no PATH | `ffmpeg` |

## Como funciona

1. A cada 30 s o agente pede a configuração à plataforma (isso também mostra na tela que ele está
   ligado).
2. Em cada horário da câmera (ex.: 7h, 12h, 17h), tira a foto. Se falhar, tenta de novo a cada
   5 minutos por até 1 hora e avisa a plataforma do erro; a tela alerta a partir de 2 falhas seguidas.
3. "Testar foto" na plataforma: o agente responde no próximo ciclo (até 30 s) com a foto ou com o erro.
4. Token perdido ou computador trocado: desligue o agente na plataforma e cadastre outro.
