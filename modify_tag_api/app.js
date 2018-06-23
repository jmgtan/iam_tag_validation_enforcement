var AWS = require("aws-sdk");

function generateResponse(statusCode, body) {
    return {
        statusCode: statusCode,
        body: JSON.stringify(body)
    };
}

exports.handler = async(event) => {
    var dynamodb = new AWS.DynamoDB();
    var ec2 = new AWS.EC2();
    var iam = new AWS.IAM();

    var tableName = "user_group_metadata";
    var requiredTags = ["Department", "Service"];

    var body = event.body;
    var body = JSON.parse(body);
    var requesterUsername = body.requester_username;
    var resourceIds = body.resource_ids;
    var tags = body.tags;

    var tagsPayload = [];

    for (tagKey in tags) {
        var tagValue = tags[tagKey];

        if (requiredTags.indexOf(tagKey) == -1) {
            tagsPayload.push({
                Key: tagKey,
                Value: tagValue
            });
        }
    }

    if (tagsPayload.length > 0) {
        try {
            var userGroups = await iam.listGroupsForUser({UserName: requesterUsername}).promise();
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
                    var requiredTagsMap = {};
                    for (i in requiredTags) {
                        var tagKey = requiredTags[i];
                        var tagValue = item.RequiredTags.M[tagKey].S;
                        requiredTagsMap[tagKey] = tagValue;
                    }
    
                    var params = {
                        Filters: [
                            {
                                Name: "resource-id",
                                Values: resourceIds
                            }
                        ]
                    };
    
                    var describeTagsResult = await ec2.describeTags(params).promise();
                    var instanceTagsMap = {};
                    for (i in describeTagsResult.Tags) {
                        var tag = describeTagsResult.Tags[i];
                        if (!(tag.ResourceId in instanceTagsMap)) {
                            instanceTagsMap[tag.ResourceId] = {};
                        }
    
                        instanceTagsMap[tag.ResourceId][tag.Key] = tag.Value;
                    }
    
                    var finalResourceIds = [];
                    for (i in resourceIds) {
                        var resourceId = resourceIds[i];
    
                        if (resourceId in instanceTagsMap) {
                            instanceTagMap = instanceTagsMap[resourceId];

                            if (instanceTagMap[requiredTags[0]] == requiredTagsMap[requiredTags[0]]
                                && instanceTagMap[requiredTags[1]] == requiredTagsMap[requiredTags[1]]) {
                                    finalResourceIds.push(resourceId);
                                }
                        }
                    }

                    if (finalResourceIds.length > 0) {
                        var params = {
                            Resources: resourceIds,
                            Tags: tagsPayload
                        };

                        var createTagsResult = await ec2.createTags(params).promise();

                        return generateResponse(200, {updated_resource_ids: finalResourceIds});
                    }
                }
            }
        } catch (err) {
            console.error(err);
            return generateResponse(500, {error: err});
        }
    }

    return generateResponse(200, {updated_resource_ids: []});
}