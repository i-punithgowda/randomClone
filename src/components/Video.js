import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import * as SignalWire from "@signalwire/js";
import {
  getLayouts,
  getCameras,
  getMicrophones,
  getSpeakers
} from "../utility/utils";

import SERVERLOCATION from "../serverLocation";

export default function Video({
  onRoomInit = () => {},
  onRoomUpdate = () => {},
  width = 400,
  joinDetails: roomDetails = { room: "signalwire", name: "John Doe" },
  eventLogger = (msg) => {
    console.log("Event:", msg);
  },
  onMemberListUpdate = () => {}
}) {
  let [isLoading, setIsLoading] = useState("true");
  let [setupDone, setSetupDone] = useState(false);
  let thisMemberId = useRef(null);
  let memberList = useRef([]);

  useEffect(() => {
    if (setupDone) return;
    setup_room();
    async function updateMemberList(room) {
      let m;
      try {
        m = await room.getMembers();
      } catch (e) {
        console.log("Unable to get available members because of errors:", e);
        return;
      }
      let members = m.members;
      if (members === undefined) return;
      memberList.current = members;
      onMemberListUpdate(memberList.current);
    }
    async function setup_room() {
      setSetupDone(true);
      let token, room;
      try {
        token = await axios.post(SERVERLOCATION + "/get_token", {
          user_name: roomDetails.name,
          room_name: roomDetails.room,
          mod: roomDetails.mod
        });
        console.log(token.data);
        token = token.data.token;

        try {
          console.log("Setting up RTC session");
          try {
            room = await SignalWire.Video.createRoomObject({
              token,
              rootElementId: "temp",
              video: true
            });
          } catch (e) {
            console.log(e);
          }
          room.on("room.joined", async (e) => {
            thisMemberId.current = e.member_id;
            memberList.current = [...e.room.members];
            let thisMember = memberList.current.filter(
              (m) => m.id === e.member_id
            );
            if (thisMember.length >= 1) thisMember = thisMember[0];
            onRoomUpdate({ thisMemberId: e.member_id, member: thisMember });
            eventLogger("You have joined the room.");
          });
          room.on("room.updated", async (e) => {
            eventLogger("Room has been updated");
            await updateMemberList(room);
          });
          room.on("member.joined", async (e) => {
            eventLogger(e.member.name + " has joined the room.");
            await updateMemberList(room);
          });
          room.on("member.updated", async (e) => {
            // eventLogger(e.member.id + " has been udpated [details]");
            await updateMemberList(room);
          });
          room.on("layout.changed", async (e) => {
            onRoomUpdate({ layout: e.layout.name });
          });
          room.on("member.left", async (e) => {
            let member = memberList.current.filter((m) => m.id === e.member.id);
            if (member.length === 0) {
              onRoomUpdate({ left: true });
              return;
            }
            eventLogger(member[0]?.name + " has left the room.");
            if (thisMemberId.current === member[0]?.id) {
              console.log("It is you who has left the room");
              onRoomUpdate({ left: true });
            }
            await updateMemberList(room);
          });

          await room.join();

          let layout = await getLayouts(room);
          let cameras = await getCameras();
          let microphones = await getMicrophones();
          let speakers = await getSpeakers();

          await updateMemberList(room);

          setIsLoading(false);
          onRoomInit(room, layout, cameras, microphones, speakers);

          let camChangeWatcher = await SignalWire.WebRTC.createDeviceWatcher({
            targets: ["camera"]
          });
          camChangeWatcher.on("changed", (changes) => {
            eventLogger("The list of camera devices has changed");
            onRoomUpdate({ cameras: changes.devices });
          });
          let micChangeWatcher = await SignalWire.WebRTC.createDeviceWatcher({
            targets: ["microphone"]
          });
          micChangeWatcher.on("changed", (changes) => {
            eventLogger("The list of microphone devices has changed");
            onRoomUpdate({ microphones: changes.devices });
          });
          let speakerChangeWatcher = await SignalWire.WebRTC.createDeviceWatcher(
            {
              targets: ["speaker"]
            }
          );
          speakerChangeWatcher.on("changed", (changes) => {
            eventLogger("The list of speakers has changed");
            onRoomUpdate({ speakers: changes.devices });
          });
        } catch (error) {
          setIsLoading(false);
          console.error("Something went wrong", error);
        }
      } catch (e) {
        setIsLoading(false);
        console.log(e);
        alert("Error encountered. Please try again.");
      }
    }
  }, [
    roomDetails,
    eventLogger,
    onMemberListUpdate,
    onRoomInit,
    onRoomUpdate,
    setupDone
  ]);
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
    >
      {isLoading && (
        <div
          style={{
            position: "absolute",
            background: "rgba(0,0,0,0.5)",
            color: "#fff",
            width,
            minHeight: 500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          Loading ...
        </div>
      )}
      <div
        id="temp"
        style={{
          width,
          minHeight: 500
        }}
      ></div>
    </div>
  );
}
