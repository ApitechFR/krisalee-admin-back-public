#!/bin/bash

mongoimport --uri=mongodb://localhost:27017/krisalee --authenticationDatabase=admin --username=root --password= --collection='tag' --file="./seed/tag.json" --drop