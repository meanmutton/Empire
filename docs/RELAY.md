# Online relay

Empire's online games are **asynchronous**: players take turns one after another, and nobody needs to be
online at the same time. A small relay on AWS stores each game and passes turns along.

It's the same style as Hexfront's relay (API Gateway WebSocket + Lambda), with one big difference:
Hexfront's relay only forwards messages between two connected players, while Empire's relay **stores the
game** in DynamoDB. That's what lets a player who is offline pick up their turn later.

```
browser ──WebSocket──► API Gateway (wss://…/live) ──► Lambda (relay/src/lambda.ts) ──► DynamoDB
   ▲                                                         │
   └──────────── "turn" pushes to connected players ◄────────┘
```

## How a game flows
1. **Create**: the host picks an empire and settings and gets a six-letter code (like Hexfront's codes).
2. **Join**: friends enter the code and claim a free major empire. Up to 5 humans; the computer plays the
   rest.
3. **Start**: the host's browser generates the galaxy, plays the computer factions up to the first human,
   and uploads the packed state (gzip + base64, about 30–100 KB).
4. **Turns**: when it's your turn, your browser downloads the latest state, you play, and on End Turn your
   browser also plays every computer faction up to the next human. Then it uploads the result. Everyone
   connected gets a "turn" push. Everyone else sees whose turn it is next time they open the game.
5. **Caretaker turns**: if a game sets a turn timeout (default 24 hours) and the active player has gone
   quiet, any other player may let the computer play a defensive caretaker turn for them, so the game
   keeps moving.

The engine is deterministic: the same state and orders give the same result on every machine. The relay
doesn't run game rules. It checks identity (a secret token per seat), turn order (only the active
player, or a caretaker after the timeout, may submit), and versions (a stale upload is rejected, so two
people can't play the same turn).

## Protocol
JSON text messages. Client → relay messages have an `action` and a `req` id; replies echo `req`. See
`src/net/protocol.ts` for exact types.

| action | who | what |
|--------|-----|------|
| `create` | host | new lobby; returns the code |
| `join` | anyone | see the lobby (and register for pushes) |
| `claim` | anyone in lobby | take a free empire (or switch) |
| `leave` | non-host in lobby | give up a seat |
| `hello` | seat holder | reconnect; returns the lobby, version and whose turn it is |
| `upload` | seat holder | one chunk (≤ 24,000 chars) of a packed state |
| `start` | host | start the game with an uploaded state |
| `submit` | active player (or caretaker) | the state after a turn, with the version it was based on |
| `get` | seat holder | download the current state (arrives as `state` chunks) |
| `message` | seat holder | chat to some players (`to: [factions]`) or everyone (`to: ['all']`), up to 1,000 characters; pushed to connected recipients |
| `messages` | seat holder | fetch the messages this player may read, newer than a timestamp |
| `notify` | seat holder | set (or clear with `null`) the email for "your turn" notices; the reply shows it masked |
| `ping` | anyone | keep-alive |

Relay → client: `created`, `lobby`, `turn` (pushed to everyone connected), `state` (chunks), `message`
(pushed to its recipients), `messages`, `ack`, `error`, `pong`.

Chat is stored in the same table (`GAME#code / MSG#time#id`, kept 90 days). The relay only returns a
message to its sender and recipients.

States are chunked because API Gateway WebSocket frames are capped at 32 KB and messages at 128 KB.

Every uploaded state is stored under its own key (`version-uploadId`). The game record points at the current
one, and the pointer moves with a conditional write on the version. If two valid submissions race (the
same player on two devices, or a caretaker turn arriving just as the late player submits), exactly one
wins. The loser's state is deleted, and it can never overwrite the winner's. The relay keeps the current
and previous states, so a player who is mid-download still gets a complete state.

## Turn notices by email (optional)
Players can give an email address for a game (in the lobby, or from the in-game menu). The relay:
- stores it privately on the player's seat, never sends it to other players, and shows it back to its owner
  only masked (`b•••@example.com`);
- emails a player when the turn passes to them **and they are not connected**, and emails everyone who asked
  when the game ends;
- deletes it when the player turns notices off, and with the game when it expires (90 days after its last
  turn).

Email is **off unless configured**. In AWS it goes through Amazon SES:
1. In the SES console, verify a sender (an address, or better a domain you own).
2. New SES accounts are in the **sandbox** and can only email verified addresses. To email your friends,
   request **production access** in the SES console (a short form; usually approved within a day).
3. Deploy with the sender: `NOTIFY_FROM=empire@yourdomain.com relay/deploy.sh` (see below). To turn email off
   again, deploy with `NOTIFY_FROM=` (empty).

The local relay (`npm run relay`) prints the emails it would send to its console instead.

## Running locally
```bash
npm run relay
```
That starts `ws://localhost:8787` (in memory, saved to `relay/.data/relay.json`). Then open the game with
`?relay=ws://localhost:8787`.

## Deploying to AWS
Everything AWS needs is in one CloudFormation template, `relay/cloudformation.yaml`, and `relay/deploy.sh`
builds the Lambda package and deploys it. The easiest place to run it is **AWS CloudShell**, a terminal in the
AWS console that is already signed in and has the AWS CLI, Node.js, git and zip.

1. Sign in to the AWS console and pick the region the relay should live in (top right; Hexfront's relay is in
   **US East (Ohio), us-east-2**).
2. Open **CloudShell** (the `>_` icon in the top bar).
3. Get the code and deploy:

```bash
git clone https://github.com/meanmutton/Empire.git && cd Empire
```

```bash
relay/deploy.sh
```

The script prints the relay address at the end, a `wss://….execute-api.us-east-2.amazonaws.com/live` URL. It
is also the **RelayUrl** output of the `empire-relay` stack in the CloudFormation console.

4. Build the game with that address baked in (on your own machine, or in CloudShell and download
   `dist/index.html` with **Actions → Download file**):

```bash
EMPIRE_RELAY=wss://xxxx.execute-api.us-east-2.amazonaws.com/live npm run build
```

Or pass it at runtime: `index.html?relay=wss://…`.

**The live relay** is `wss://045fst54eg.execute-api.us-east-2.amazonaws.com/live` (stack `empire-relay`,
us-east-2). It is set in the repo's `.env`, so a plain `npm run build` includes it. If you redeploy to a new
stack, update `.env`.

**Updating**: after relay code changes, run `git pull` and `relay/deploy.sh` again. The script uploads the new
package under a new name, so CloudFormation updates the function in place; games are kept.

**Options**: `AWS_REGION=us-west-2 relay/deploy.sh` for another region, `relay/deploy.sh my-stack` for another
stack name, `NOTIFY_FROM=…` for email (above), `CODE_BUCKET=…` to use an existing S3 bucket for the package.

**Without the script**: in the CloudFormation console, choose **Create stack → With new resources**, upload
`relay/cloudformation.yaml`, and give it an S3 bucket and key holding a zip of the built `lambda.mjs`
(`npm run relay:bundle`, then zip `relay/.build/lambda.mjs`; CI also attaches it to every run as the
`relay-lambda` artifact). Acknowledge that the stack creates an IAM role.

### What it creates and costs
- One DynamoDB table (on-demand, with TTL cleanup: upload chunks and connections expire after a day, and
  games 90 days after their last turn). It is **kept if you delete the stack**, so games are never lost by
  accident; delete it by hand in the DynamoDB console if you really mean to.
- One Lambda function (Node 22, arm64) with its IAM role and a log group (logs kept 14 days).
- One WebSocket API (API Gateway), throttled to 50 messages a second.
- One S3 bucket, `empire-relay-code-<account>-<region>`, holding the Lambda packages (private).

For a group of friends this is a few cents a month: each turn is a handful of small writes, and everything
is well inside the AWS free tier at first.

**Removing it**: delete the `empire-relay` stack in the CloudFormation console, then (if you want) the table
and the code bucket.

## Security notes
- Seat tokens are random secrets kept in each player's browser and stored only as SHA-256 hashes.
- Anyone with the code can watch a game's lobby. Only seat holders can download or submit states.
- Because every player's browser holds the full state, a determined player could inspect hidden
  information. Empire is meant for friends; real hidden information would need the relay to run the engine
  (possible later: the engine is plain TypeScript and could run in the Lambda).
