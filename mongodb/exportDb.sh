#!/bin/bash

collections=('product' 'connector' 'mode' 'organization' 'service' 'user' 'snapshot')

# rm -r mongodb/seed
mkdir -p mongodb/seed

for collection in "${collections[@]}"
do
   mongoexport --uri=mongodb://localhost:27017/krisalee --authenticationDatabase=admin -u=root -p= -c=$collection --out=/seed/seed/$collection.json
done