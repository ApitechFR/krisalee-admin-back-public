#!/bin/bash

mongoimport --uri=mongodb://localhost:27017/krisalee --authenticationDatabase=admin --username=root --password= --collection='mode' --file="./seed/mode.json" --drop