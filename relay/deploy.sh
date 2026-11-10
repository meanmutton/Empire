#!/usr/bin/env bash
# Builds the relay's Lambda package and deploys relay/cloudformation.yaml with the AWS CLI.
# Run it from AWS CloudShell (or any machine with the AWS CLI, Node.js and zip, signed in to your account):
#
#   relay/deploy.sh                    # stack "empire-relay" in us-east-2
#   AWS_REGION=us-west-2 relay/deploy.sh my-relay
#   NOTIFY_FROM=empire@yourdomain.com relay/deploy.sh   # turn on "your turn" emails (see docs/RELAY.md)
#
# Safe to run again: it uploads the new code under a new name and updates the stack in place.
set -euo pipefail
cd "$(dirname "$0")/.."

STACK="${1:-empire-relay}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-2}}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${CODE_BUCKET:-empire-relay-code-${ACCOUNT}-${REGION}}"

echo "Account ${ACCOUNT}, region ${REGION}, stack ${STACK}"

echo "Building the Lambda package..."
mkdir -p relay/.build
npx --yes esbuild@0.27.4 relay/src/lambda.ts --bundle --platform=node --format=esm --target=es2022 \
  --external:@aws-sdk/* --outfile=relay/.build/lambda.mjs --log-level=warning
(cd relay/.build && rm -f lambda.zip && zip -q lambda.zip lambda.mjs)
if command -v sha256sum >/dev/null; then HASH="$(sha256sum relay/.build/lambda.zip | cut -c1-16)"
else HASH="$(shasum -a 256 relay/.build/lambda.zip | cut -c1-16)"; fi
KEY="relay/lambda-${HASH}.zip"

if ! aws s3api head-bucket --bucket "${BUCKET}" --region "${REGION}" 2>/dev/null; then
  echo "Creating the code bucket ${BUCKET}..."
  if [ "${REGION}" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}" >/dev/null
  else
    aws s3api create-bucket --bucket "${BUCKET}" --region "${REGION}" \
      --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null
  fi
  aws s3api put-public-access-block --bucket "${BUCKET}" --region "${REGION}" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi
echo "Uploading s3://${BUCKET}/${KEY}..."
aws s3 cp relay/.build/lambda.zip "s3://${BUCKET}/${KEY}" --region "${REGION}" --only-show-errors

PARAMS=("CodeBucket=${BUCKET}" "CodeKey=${KEY}")
# Only change the email sender when asked; otherwise the stack keeps its current setting.
if [ -n "${NOTIFY_FROM+x}" ]; then PARAMS+=("NotifyFrom=${NOTIFY_FROM}"); fi

echo "Deploying the stack (a first deploy takes a minute or two)..."
aws cloudformation deploy --region "${REGION}" --stack-name "${STACK}" \
  --template-file relay/cloudformation.yaml --capabilities CAPABILITY_IAM \
  --parameter-overrides "${PARAMS[@]}" --no-fail-on-empty-changeset

URL="$(aws cloudformation describe-stacks --region "${REGION}" --stack-name "${STACK}" \
  --query "Stacks[0].Outputs[?OutputKey=='RelayUrl'].OutputValue" --output text)"
echo
echo "Relay address: ${URL}"
echo "Build the game with it:  EMPIRE_RELAY=${URL} npm run build"
echo "Or open the game with:   index.html?relay=${URL}"
