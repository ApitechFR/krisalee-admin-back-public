#!/bin/bash

# when a command fails, bash exits instead of continuing with the rest of the script.
# This will make the script fail, when accessing an unset variable
#This will ensure that a pipeline command is treated as failed, even if one command in the pipeline fails.

# Makes the script fail/exit when
#   - A command fails
#   - Accessing an unset variable
#   - One command in a pipeline fails
set -o errexit
set -o nounset
set -o pipefail

# Users & paths
readonly GROUP_ADMIN_UID="1001"
readonly GROUP_ADMIN_NAME_OLD="group_${GROUP_ADMIN_UID}"
readonly GROUP_ADMIN_NAME="admins"
readonly USER_ADMIN_NAME="x_admin_sftp"
readonly USER_ADMIN_HOME="/home/${USER_ADMIN_NAME}"
readonly UPLOAD_ROOT_PATH="upload/files"

# Folders
declare -A UPLOAD_FOLDERS
UPLOAD_FOLDERS[cm]="crisis_management"
UPLOAD_FOLDERS[td]="technical_documents"
UPLOAD_FOLDERS[d]="directory"

# Rename admin group if needed
if [ $(getent group ${GROUP_ADMIN_NAME_OLD}) ];
then
    groupmod -n ${GROUP_ADMIN_NAME} ${GROUP_ADMIN_NAME_OLD}
fi

# Search for admin user and group
if [ $(getent group ${GROUP_ADMIN_NAME}) ] && [ $(getent pass ${USER_ADMIN_NAME}) ];
then
  echo "Admin user and group found !"
else
  echo "Admin user and group not found ! Exiting..."
  exit 1
fi

echo "Running script in ${USER_ADMIN_HOME}/${UPLOAD_ROOT_PATH} ..."

for key in ${!UPLOAD_FOLDERS[@]};
do
    user_dir_name="${key}_user_sftp"

    # Search for directory user
    if [ $(getent passwd ${user_dir_name}) ];
    then
        echo "Directory user found !"
    else
        echo "Directory user not found ! Exiting..."
        exit 1
    fi

    folder_path="${USER_ADMIN_HOME}/${UPLOAD_ROOT_PATH}/${UPLOAD_FOLDERS[${key}]}"
    echo "Creating folder ${folder_path} and applying rights..."

    # Create folder, make associated user and admins group owner, modify rights
    mkdir -p ${folder_path}
    chown ${user_dir_name}:${GROUP_ADMIN_NAME} ${folder_path}
    chmod 770 ${folder_path}

done

echo "Done !"
exit 0