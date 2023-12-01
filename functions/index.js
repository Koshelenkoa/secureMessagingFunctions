// The Firebase Admin SDK to access Firestore.

const {logger} = require("firebase-functions");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore, Timestamp} =
  require("firebase-admin/firestore");
const {onCall} = require("firebase-functions/v2/https");
const {getAuth} = require("firebase-admin/auth");
const functions = require("firebase-functions");
const admin = require("firebase-admin");

initializeApp();

exports.updateToken = onCall(async (req) => {
  try {
    const deviceToken = req.data.token;
    const uid = await req.auth.uid;
    logger.log(uid);
    await getAuth().setCustomUserClaims(uid, {token: deviceToken});
    return "200";
  } catch (err) {
    logger.error(err);
    return "500";
  }
});

exports.sendMessageToClient =
  functions.firestore.document("channels/{channelId}/messages/{messageId}")
      .onCreate(
          async (snapshot, context) => {
            try {
              const newMessage = snapshot.data();
              const channelId = context.params.channelId;
              const refToUsers = getFirestore().doc(`channels/${channelId}`);
              const doc = await refToUsers.get();
              const mapOfUsers = doc.data().users;
              const sender = newMessage.sender;
              let recipient;

              const user1 = mapOfUsers.user1;
              const user2 = mapOfUsers.user2;

              switch (sender) {
                case user1:
                  recipient = user2;
                  break;
                case user2:
                  recipient = user1;
                  break;
              }
              logger.log(recipient);
              const userRecord = await getAuth().getUser(recipient);
              const token = await userRecord.customClaims["token"];
              logger.log(`token: ${token}`);
              const payload = {
                token: token,
                notification: {
                  title: "You're got a new message",
                },
                data: newMessage,
              };

              try {
                const res = await admin.messaging().send(payload);
                logger.log(`Message sent ${res.updateTime}`);
              } catch (err) {
                logger.error(err);
              }
            } catch (err) {
              logger.error(err);
            }
          });


exports.addMessageToServer = onCall(async (req) => {
  try {
    const db = await getFirestore();
    const message = await req.data;
    const channelId = message.chat;
    const id = message.messageId;
    const timestamp = Timestamp.now().toMillis();
    await db.collection("channels").doc(channelId)
        .collection("messages").doc(id).set(
            {
              messageId: id,
              data: message.data,
              sender: req.auth.uid,
              timestamp: timestamp.toString(),
              chat: channelId,
            },
        );
    return timestamp.toString();
  } catch (err) {
    logger.error(err);
    return "Internal server error";
  }
});

exports.createChannel = onCall(async (req) => {
  try {
    const uid = await req.auth.uid;
    const channelId = req.data.chat;
    await getFirestore().collection("channels").doc(channelId).set({
      messages: "exists",
      users: {
        user1: uid,
        user2: "none",
      },
    });
    const timestamp = Timestamp.now().toMillis();
    return timestamp.toString();
  } catch (error) {
    logger.error("Error:", error);
    return "An error occurred while processing the request.";
  }
});

exports.addUserToChannel = onCall(async (req) => {
  const channelId = req.data.chat;
  const db = getFirestore();
  const uid = req.auth.uid;
  try {
    const docRef = await db.collection("channels").doc(channelId).get();
    const users = await docRef.get("users");

    if (users.user2 != "none") {
      logger.log("This channel is unacessible");
      return "This channel is unacessible";
    } else {
      await db.doc(`channels/${channelId}`).update({"users.user2": uid});
      const timestamp = Timestamp.now().toMillis();
      return timestamp.toString();
    }
  } catch (err) {
    logger.error(err);
    return "Internal sever error";
  }
});
