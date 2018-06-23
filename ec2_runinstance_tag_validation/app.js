var AWS = require("aws-sdk");

exports.handler = async(event) => {
    var iam = new AWS.IAM();
    var dynamodb = new AWS.DynamoDB();
    var ec2 = new AWS.EC2();

    var tableName = "user_group_metadata";
    var requiredTags = ["CostCenter", "Department", "Service"];
    
    var detail = event["detail"];
    var userIdentity = detail["userIdentity"];
    var userType = userIdentity.type;

    if (userType == "IAMUser") {
        var username = userIdentity.userName;
        try {
            var userGroups = await iam.listGroupsForUser({UserName: username}).promise();

            if (userGroups != null && userGroups.Groups.length > 0) {
                var group = userGroups.Groups[0];
                var groupArn = group.Arn;
                var params = {
                    Key: {
                        "GroupARN": {
                            S: groupArn
                        }
                    },
                    TableName: tableName
                };
                var item = await dynamodb.getItem(params).promise();

                if (item != null) {
                    var item = item.Item;
                    var requiredTagsMap = [];
                    for (i in requiredTags) {
                        var tagKey = requiredTags[i];
                        var tagValue = item.RequiredTags.M[tagKey].S;
                        requiredTagsMap.push({Key: tagKey, Value: tagValue});
                    }
                    var resourceIds = [];
                    var instanceIds = [];
                    var instanceItems = detail['responseElements']['instancesSet']['items'];
                    for (i in instanceItems) {
                        instanceIds.push(instanceItems[i]["instanceId"]);
                        resourceIds.push(instanceItems[i]["instanceId"]);
                    }

                    if (instanceIds.length > 0) {
                        var params = {
                            InstanceIds: instanceIds
                        };

                        var describeInstancesResult = await ec2.describeInstances(params).promise();
                        if (describeInstancesResult != null && describeInstancesResult.Reservations.length > 0) {
                            for (i in describeInstancesResult.Reservations) {
                                var instanceDetails = describeInstancesResult.Reservations[i].Instances[0];
                                for (j in instanceDetails.BlockDeviceMappings) {
                                    var blockDevice = instanceDetails.BlockDeviceMappings[j];
                                    resourceIds.push(blockDevice.Ebs.VolumeId);
                                }
                            }
                        }

                        var params = {
                            Resources: resourceIds,
                            Tags: requiredTagsMap
                        };
                        
                        return await ec2.createTags(params).promise();
                    }
                }
            }
        } catch (err) {
            console.log(err);
            return err;
        }
        
    }

    return [];
}