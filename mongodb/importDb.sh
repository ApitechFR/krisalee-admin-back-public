#!/bin/bash

host=$(hostname -I)

collections=('connector' 'mode' 'organization' 'service' 'user' 'product' 'snapshot')

# mkdir -p /mongodb_data_container/seed
echo $host

for collection in "${collections[@]}"
do
   mongoimport --uri=mongodb://localhost:27017/krisalee --authenticationDatabase=admin --username=root --password= --collection=$collection --file="./seed/$collection.json" --drop
done