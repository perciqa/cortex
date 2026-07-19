#!/bin/bash
cd /workspace/cortex/console/perciqa-console
export NEXT_PUBLIC_ENABLE_ARGUS=false
exec node_modules/.bin/next start -p 3001
