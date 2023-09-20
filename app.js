const express = require("express");
const app = express();
const path = require("path");
const filePath = path.join(__dirname, "twitterClone.db");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
app.use(express.json()); //middleware function
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let databaseConnection = null;

const initializeDbAndServer = async (request, response) => {
  try {
    databaseConnection = await open({
      filename: filePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running http://localhost:3000/");
    });
  } catch (error) {
    console.log(`Error is ${error.message}`);
    process.exit(1);
  }
};
initializeDbAndServer();

const convertDbObjectToResponseObject = (dbObject) => {
  return {
    username: dbObject.username,
    tweet: dbObject.username,
    dateTime: dbObject.date_time,
  };
};

const authenticationToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    //**Scenario 1** If the JWT token is not provided by the user or an invalid JWT token is provided
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_KEY", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        //**Scenario 2** After successful verification of JWT token, proceed to next middleware or handler
        request.username = payload.username;
        next();
      }
    });
  }
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const getUserDetails = `
                            SELECT 
                                * 
                            FROM 
                                user 
                            WHERE 
                                username = '${username}';`;

  const dbUser = await databaseConnection.get(getUserDetails);
  //   console.log(dbUser);

  if (dbUser === undefined) {
    if (password.length < 6) {
      // **Scenario 2** If the registrant provides a password with less than 6 characters
      response.status(400);
      response.send("Password is too short");
    } else {
      //**Scenario 3** Successful registration of the registrant
      const hashedPassword = await bcrypt.hash(password, 10);
      const createUserQuery = `
      INSERT INTO 
            user(name,username,password,gender)
      VALUES(
            '${name}',
            '${username}',
            '${hashedPassword}',
            '${gender}'
      );`;
      await databaseConnection.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    //**Scenario 1** User already exists
    response.status(400);
    response.send("User already exists");
  }
});

//API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const getUserQuery = `
                        SELECT 
                            * 
                        FROM 
                            user
                        WHERE 
                            username = '${username}';`;

  const dbUser = await databaseConnection.get(getUserQuery);
  //   console.log(dbUser);
  if (dbUser === undefined) {
    //**Scenario 1** If the user doesn't have a Twitter account
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    const payload = { username: username };
    if (isPasswordMatched === true) {
      // Scenario 3  Successful login of the user
      const jwtToken = await jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      //**Scenario 2** If the user provides an incorrect password
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// API 3
app.get(
  "/user/tweets/feed/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const getUserDetails = `
    SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await databaseConnection.get(getUserDetails);
    // console.log(dbUser);

    const getUserFollowingQuery = `
    SELECT
       following_user_id
    FROM
       follower
    WHERE
       follower_user_id = '${dbUser.user_id}';
    `;
    const userFollowingIds = await databaseConnection.all(
      getUserFollowingQuery
    );
    // console.log(userFollowingIds);

    const covertUserFollowingIdIntoArray = userFollowingIds.map(
      (eachObject) => eachObject.following_user_id
    );
    // console.log(covertUserFollowingIdIntoArray);
    const getLatestTweetsQuery = `
            SELECT
              user.username, tweet.tweet, tweet.date_time as dateTime
            FROM
              user NATURAL JOIN tweet 
            WHERE
              user.user_id IN (${covertUserFollowingIdIntoArray})
            ORDER BY
              tweet.date_time desc
            limit 4;`;

    const latestTweets = await databaseConnection.all(getLatestTweetsQuery);
    // console.log(latestTweets);
    response.send(latestTweets);
  }
);

//API 4

app.get("/user/following/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
                        SELECT
                          *
                        FROM
                          user
                        WHERE
                          username = '${username}';`;

  const dbUser = await databaseConnection.get(getUserQuery);
  //   console.log(dbUser);

  const getUserFollowingQuery = `
 SELECT
   following_user_id
 FROM
    follower
 WHERE
    follower_user_id = '${dbUser.user_id}';`;

  const userFollowingIds = await databaseConnection.all(getUserFollowingQuery);
  //   console.log(userFollowingIds);
  const covertUserFollowingIdIntoArray = userFollowingIds.map(
    (eachObject) => eachObject.following_user_id
  );
  const getUserFollowingNameQuery = `
  SELECT
    name
  FROM
    user
  WHERE user_id IN (${covertUserFollowingIdIntoArray})`;

  const dbResponse = await databaseConnection.all(getUserFollowingNameQuery);
  response.send(dbResponse);
});

//API 5
app.get("/user/followers/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserQuery = `
    SELECT 
      *
    FROM
      user 
    WHERE 
    username = '${username}';`;

  const dbUser = await databaseConnection.get(getUserQuery);

  const getUserFollowersQuery = `
  SELECT 
    follower_user_id
  FROM 
    follower
  WHERE  
     following_user_id = '${dbUser.user_id}'`;

  const userFollowersIds = await databaseConnection.all(getUserFollowersQuery);
  const covertUserFollowersIdIntoArray = userFollowersIds.map(
    (eachObject) => eachObject.follower_user_id
  );
  console.log(covertUserFollowersIdIntoArray);

  const getUsersFollowersIdsQuery = `
  SELECT 
     name
  FROM
     user 
  WHERE 
    user_id IN (${covertUserFollowersIdIntoArray});`;

  const getUserFollowersArray = await databaseConnection.all(
    getUsersFollowersIdsQuery
  );
  response.send(getUserFollowersArray);
});

//API 6

const convertDbObjectToResponse = (
  tweetAndTweetDate,
  likesCount,
  replyCount
) => {
  return {
    tweet: tweetAndTweetDate.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetAndTweetDate.date_time,
  };
};

app.get("/tweets/:tweetId/", authenticationToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const getUserDetailsQuery = `
  SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await databaseConnection.get(getUserDetailsQuery);

  //get the ids of whom the user is following
  const userFollowingIdsQuery = `
                SELECT  
                   following_user_id 
                FROM
                   follower
                WHERE 
                    follower_user_id = '${dbUser.user_id}'`;
  const userFollowingIds = await databaseConnection.all(userFollowingIdsQuery);
  //   console.log(userFollowingIds);
  const getFollowingIdsArray = userFollowingIds.map(
    (eachObject) => eachObject.following_user_id
  );

  //get the tweets made by the users he is following
  const getTweetIdsQuery = `select 
                                    tweet_id 
                                from 
                                    tweet 
                                where 
                                    user_id in (${getFollowingIdsArray});`;

  const getTweetIdsArray = await databaseConnection.all(getTweetIdsQuery);
  const followingTweetIds = getTweetIdsArray.map((eachId) => {
    return eachId.tweet_id;
  });

  if (followingTweetIds.includes(parseInt(tweetId))) {
    //**Scenario 2**If the user requests a tweet of the user he is following, return the tweet, likes count, replies count and date-time
    const getLikesQuery = `
    SELECT 
      count(user_id) as likes
    FROM
      like
    WHERE
      tweet_id = '${tweetId}';`;
    const likesCount = await databaseConnection.get(getLikesQuery);
    // console.log(likesCount);

    const replyCountQuery = `SELECT 
                                   count(user_id) AS replies 
                                FROM 
                                   reply 
                                WHERE 
                                   tweet_id = ${tweetId};`;
    const replyCount = await databaseConnection.get(replyCountQuery);
    // console.log(replyCount);

    const getTweetAndTweetDateQuery = `
                        select
                          tweet,date_time
                        FROM 
                          tweet 
                        WHERE tweet_id = '${tweetId}'`;
    const tweetAndTweetDate = await databaseConnection.get(
      getTweetAndTweetDateQuery
    );
    // console.log(tweetAndTweetDate);
    response.send(
      convertDbObjectToResponse(tweetAndTweetDate, likesCount, replyCount)
    );
  } else {
    //**Scenario 1** If the user requests a tweet other than the users he is following
    response.status(401);
    response.send("Invalid Request");
  }
});

//API 7
const convertLikedUserNameDBObjectToResponseObject = (dbObject) => {
  return {
    likes: dbObject,
  };
};
app.get(
  "/tweets/:tweetId/likes/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserDetailsQuery = `
  SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await databaseConnection.get(getUserDetailsQuery);

    //get the ids of whom the user is following
    const userFollowingIdsQuery = `
                SELECT  
                   following_user_id 
                FROM
                   follower
                WHERE 
                    follower_user_id = '${dbUser.user_id}'`;
    const userFollowingIds = await databaseConnection.all(
      userFollowingIdsQuery
    );

    const getFollowingIdsArray = userFollowingIds.map(
      (eachObject) => eachObject.following_user_id
    );

    //check is the tweet ( using tweet id) made by his followers
    const getTweetIdsQuery = `
            select 
                tweet_id 
            from 
                tweet 
            where 
                user_id in (${getFollowingIdsArray});`;

    const getTweetIdsArray = await databaseConnection.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (getTweetIds.includes(parseInt(tweetId))) {
      //**Scenario 2**If the user requests a tweet of a user he is following, return the list of usernames who liked the tweet
      const getLikedUserNamesQuery = `
                  SELECT 
                    user.username AS likes
                  FROM 
                    user INNER JOIN like ON
                    user.user_id = like.user_id
                 WHERE 
                    like.tweet_id = ${tweetId};`;

      const getLikedUserNamesArray = await databaseConnection.all(
        getLikedUserNamesQuery
      );
      //   console.log(getLikedUserNamesArray);
      const getLikedUserNames = getLikedUserNamesArray.map((eachUser) => {
        return eachUser.likes;
      });
      //   console.log(getLikedUserNames);
      response.send(
        convertLikedUserNameDBObjectToResponseObject(getLikedUserNames)
      );
    } else {
      //**Scenario 1**If the user requests a tweet other than the users he is following
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 8
const convertUserNameReplyedDBObjectToResponseObject = (dbObject) => {
  return {
    replies: dbObject,
  };
};

app.get(
  "/tweets/:tweetId/replies/",
  authenticationToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserDetailsQuery = `
  SELECT * FROM user WHERE username = '${username}';`;
    const dbUser = await databaseConnection.get(getUserDetailsQuery);

    //get the ids of whom the user is following
    const userFollowingIdsQuery = `
                SELECT  
                   following_user_id 
                FROM
                   follower
                WHERE 
                    follower_user_id = '${dbUser.user_id}'`;
    const userFollowingIds = await databaseConnection.all(
      userFollowingIdsQuery
    );

    const getFollowingIdsArray = userFollowingIds.map(
      (eachObject) => eachObject.following_user_id
    );

    //check is the tweet ( using tweet id) made by his followers
    const getTweetIdsQuery = `
            select 
                tweet_id 
            from 
                tweet 
            where 
                user_id in (${getFollowingIdsArray});`;

    const getTweetIdsArray = await databaseConnection.all(getTweetIdsQuery);
    const getTweetIds = getTweetIdsArray.map((eachTweet) => {
      return eachTweet.tweet_id;
    });

    if (getTweetIds.includes(parseInt(tweetId))) {
      //**Scenario 2**If the user requests a tweet of a user he is following, return the list of replies.

      const getUsernameReplyTweetsQuery = `
                  SELECT 
                    user.name, reply.reply
                  FROM 
                    user INNER JOIN reply ON
                     user.user_id=reply.user_id
                 WHERE 
                    reply.tweet_id = ${tweetId};`;

      const getUsernameReplyTweets = await databaseConnection.all(
        getUsernameReplyTweetsQuery
      );

      response.send(
        convertUserNameReplyedDBObjectToResponseObject(getUsernameReplyTweets)
      );
    } else {
      //**Scenario 1**If the user requests a tweet other than the users he is following
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API 9
app.get("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const getUserDetailsQuery = `
    SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await databaseConnection.get(getUserDetailsQuery);

  //get tweets made by user
  const getTweetIdsQuery = `select tweet_id from tweet where user_id=${dbUser.user_id};`;
  const getTweetIdsArray = await databaseConnection.all(getTweetIdsQuery);
  const getTweetIds = getTweetIdsArray.map((eachId) => {
    return parseInt(eachId.tweet_id);
  });

  const tweetsQuery = `
   SELECT
   tweet,
   (
       SELECT COUNT(like_id)
       FROM like
       WHERE tweet_id=tweet.tweet_id
   ) AS likes,
   (
       SELECT COUNT(reply_id)
       FROM reply
       WHERE tweet_id=tweet.tweet_id
   ) AS replies,
   tweet.date_time AS dateTime
   FROM tweet
   WHERE user_id= ${dbUser.user_id}
   `;
  const dbResponse = await databaseConnection.all(tweetsQuery);
  //   console.log(dbResponse);
  response.send(dbResponse);
});
//API - 10
app.post("/user/tweets/", authenticationToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const getUserDetailsQuery = `SELECT 
                            * 
                          FROM 
                            user 
                          WHERE 
                            username = '${username}';`;
  const dbUser = await databaseConnection.get(getUserDetailsQuery);
  const currentDate = new Date();

  const createTweetQuery = `
   INSERT INTO tweet(tweet,user_id,date_time)
   VALUES (
       '${tweet}',
       '${dbUser.user_id}',
       '${currentDate}'
       );`;
  const dbResponse = await databaseConnection.run(createTweetQuery);
  const tweetId = dbResponse.lastID;
  response.send("Created a Tweet");
});

//API - 11
app.delete(
  "/tweets/:tweetId/",
  authenticationToken,
  async (request, response) => {
    const { tweetId } = request.params;
    //console.log(tweetId);
    let { username } = request;
    const getUserIdQuery = `select user_id from user where username='${username}';`;
    const getUserId = await databaseConnection.get(getUserIdQuery);
    //console.log(getUserId.user_id);
    //tweets made by the user
    const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`;
    const getUserTweetsListArray = await databaseConnection.all(
      getUserTweetsListQuery
    );
    const getUserTweetsList = getUserTweetsListArray.map((eachTweetId) => {
      return eachTweetId.tweet_id;
    });
    // console.log(getUserTweetsList);
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`;
      await databaseConnection.run(deleteTweetQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
