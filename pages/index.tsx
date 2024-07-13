import Head from 'next/head';
import React, { useEffect, useRef, useState } from 'react';
import styles from '../styles/Home.module.css';
import { RtmChannel } from 'agora-rtm-sdk';
import {
  ICameraVideoTrack,
  IRemoteVideoTrack,
  IAgoraRTCClient,
  IRemoteAudioTrack,
} from 'agora-rtc-sdk-ng';
import ricardo from '../public/ricardo.png';
import Image from 'next/image';
import img from '../public/bg-1.png';
import html2canvas from 'html2canvas';
import egg from '../public/egg.png';

type TCreateRoomResponse = {
  room: Room;
  rtcToken: string;
  rtmToken: string;
};

type TGetRandomRoomResponse = {
  rtcToken: string;
  rtmToken: string;
  rooms: Room[];
};

type Room = {
  _id: string;
  status: string;
};

type TMessage = {
  userId: string;
  message: string | undefined;
};

interface IExtendedRemoteVideoTrack extends IRemoteVideoTrack {
  getElement?: () => HTMLVideoElement; // Ensure it returns HTMLVideoElement
}

interface IExtendedCameraVideoTrack extends ICameraVideoTrack {
  getElement?: () => HTMLVideoElement; // Ensure it returns HTMLVideoElement
}

function createRoom(userId: string): Promise<TCreateRoomResponse> {
  return fetch(`/api/rooms?userId=${userId}`, {
    method: 'POST',
  }).then((response) => response.json());
}

function getRandomRoom(userId: string): Promise<TGetRandomRoomResponse> {
  return fetch(`/api/rooms?userId=${userId}`).then((response) =>
    response.json()
  );
}

function setRoomToWaiting(roomId: string) {
  return fetch(`/api/rooms/${roomId}`, { method: 'PUT' }).then((response) =>
    response.json()
  );
}

export const VideoPlayer = ({
  videoTrack,
  style,
}: {
  videoTrack: IExtendedRemoteVideoTrack | IExtendedCameraVideoTrack;
  style: React.CSSProperties;
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const playerRef = ref.current;
    if (!videoTrack) return;
    if (!playerRef) return;

    videoTrack.play(playerRef);

    // Add getElement method to videoTrack
    (
      videoTrack as IExtendedRemoteVideoTrack | IExtendedCameraVideoTrack
    ).getElement = () => playerRef?.querySelector('video') as HTMLVideoElement;

    return () => {
      videoTrack.stop();
    };
  }, [videoTrack]);

  return <div ref={ref} style={style}></div>;
};

async function connectToAgoraRtm(
  roomId: string,
  userId: string,
  onMessage: (message: TMessage) => void,
  token: string
) {
  const { default: AgoraRTM } = await import('agora-rtm-sdk');
  const client = AgoraRTM.createInstance(process.env.NEXT_PUBLIC_AGORA_APP_ID!);
  await client.login({
    uid: userId,
    token,
  });
  const channel = await client.createChannel(roomId);
  await channel.join();
  channel.on('ChannelMessage', (message, userId) => {
    onMessage({
      userId,
      message: message.text,
    });
  });

  return {
    channel,
  };
}

export default function Home() {
  const [userId] = useState(parseInt(`${Math.random() * 1e6}`) + '');
  const [room, setRoom] = useState<Room | undefined>();
  const [messages, setMessages] = useState<TMessage[]>([]);
  const [input, setInput] = useState('');
  const [themVideo, setThemVideo] = useState<IRemoteVideoTrack>();
  const [myVideo, setMyVideo] = useState<ICameraVideoTrack>();
  const [themAudio, setThemAudio] = useState<IRemoteAudioTrack>();
  const [isDetected, setIsDetected] = useState(false);
  const [whoMoved, setWhoMoved] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [imageSrc, setImageSrc] = useState('');
  const [imageSrc2, setImageSrc2] = useState('');

  const isMoved = useRef(false);
  const isSnap = useRef(false);
  const channelRef = useRef<RtmChannel>();
  const rtcClientRef = useRef<IAgoraRTCClient>();

  async function connectToAgoraRtc(
    roomId: string,
    userId: string,
    onVideoConnect: (videoTrack: IExtendedRemoteVideoTrack) => void,
    onWebcamStart: (videoTrack: IExtendedCameraVideoTrack) => void,
    onAudioConnect: (audioTrack: IRemoteAudioTrack) => void,
    token: string
  ) {
    const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');

    const client = AgoraRTC.createClient({
      mode: 'rtc',
      codec: 'vp8',
    });
    let themUsers;
    await client.join(
      process.env.NEXT_PUBLIC_AGORA_APP_ID!,
      roomId,
      token,
      userId
    );

    client.on('user-published', (themUser, mediaType) => {
      client.subscribe(themUser, mediaType).then(() => {
        if (mediaType === 'video') {
          const remoteVideoTrack =
            themUser.videoTrack as IExtendedRemoteVideoTrack;
          onVideoConnect(remoteVideoTrack);
          // detectMotion(remoteVideoTrack, false);
          // setWhoMoved('another');
        }
        if (themUser) {
          themUsers = themUser;
          setTimeout(() => {
            detectMotion(remoteVideoTrack, false);
            setWhoMoved('another');
          }, 2000); // Start detectMotion after 2 seconds
        }
        if (mediaType === 'audio') {
          onAudioConnect(themUser.audioTrack);
          themUser.audioTrack?.play();
        }
      });
    });

    const tracks = await AgoraRTC.createMicrophoneAndCameraTracks();
    const cameraTrack = tracks.find(
      (track) => track.trackMediaType === 'video'
    ) as IExtendedCameraVideoTrack;
    onWebcamStart(cameraTrack);
    if (themUsers) {
      setTimeout(() => {
        detectMotion(cameraTrack, true);
        setWhoMoved('you');
      }, 2000); // Start detectMotion after 2 seconds
    }

    await client.publish(tracks);

    return { tracks, client };
  }

  function handleNextClick() {
    connectToARoom();
  }

  function handleStartChattingClicked() {
    connectToARoom();
  }

  async function handleSubmitMessage(e: React.FormEvent) {
    e.preventDefault();
    await channelRef.current?.sendMessage({
      text: input,
    });
    setMessages((cur) => [
      ...cur,
      {
        userId,
        message: input,
      },
    ]);
    setInput('');
  }

  function getImage() {
    console.log('getting image');
    const videoConrainerId = document.getElementById('video-container-1');
    const videoConrainerId2 = document.getElementById('video-container-2');
    if (videoConrainerId && videoConrainerId2 && isSnap.current === false) {
      html2canvas(videoConrainerId, {
        width: 400,
        height: 320,
      }).then((canvas) => {
        const imageURL = canvas.toDataURL('image/jpeg', 1.0);
        console.log('img logger');
        setImageSrc(imageURL);
      });
      html2canvas(videoConrainerId2, {
        width: 400,
        height: 320,
      }).then((canvas) => {
        const imageURL2 = canvas.toDataURL('image/jpeg', 1.0);
        console.log('img logger');
        setImageSrc2(imageURL2);
      });
    }
    isSnap.current = true;
  }

  function detectMotion(
    videoTrack: IExtendedRemoteVideoTrack | IExtendedCameraVideoTrack,
    isLocal: boolean
  ) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      console.error('Failed to get canvas context');
      return;
    }

    const width = 649;
    const height = 480;
    canvas.width = width;
    canvas.height = height;
    let lastImageData: ImageData | null = null;

    function checkForMotion() {
      if (!videoTrack || !videoTrack.getElement) return;

      const element = videoTrack.getElement();
      if (!element || !(element instanceof HTMLVideoElement)) {
        console.error('Expected HTMLVideoElement, got:', element);
        return;
      }

      context.drawImage(element, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);

      if (lastImageData) {
        const diff = getFrameDifference(imageData.data, lastImageData.data);
        if (!isMoved.current && diff > 7718920) {
          // Motion threshold
          isMoved.current = true;
          setIsDetected(true);
          playSound();
          isSnap.current === false && setInterval(getImage, 50);
        }
      }
      lastImageData = imageData;
    }

    // Check for motion every second
    setInterval(checkForMotion, 2000);
  }

  async function connectToARoom() {
    setThemAudio(undefined);
    setThemVideo(undefined);
    setMyVideo(undefined);
    setMessages([]);

    if (channelRef.current) {
      await channelRef.current.leave();
    }

    if (rtcClientRef.current) {
      rtcClientRef.current.leave();
    }

    const { rooms, rtcToken, rtmToken } = await getRandomRoom(userId);

    if (room) {
      setRoomToWaiting(room._id);
    }

    if (rooms.length > 0) {
      setRoom(rooms[0]);
      const { channel } = await connectToAgoraRtm(
        rooms[0]._id,
        userId,
        (message: TMessage) => setMessages((cur) => [...cur, message]),
        rtmToken
      );
      channelRef.current = channel;

      const { tracks, client } = await connectToAgoraRtc(
        rooms[0]._id,
        userId,
        (themVideo: IRemoteVideoTrack) => setThemVideo(themVideo),
        (myVideo: ICameraVideoTrack) => setMyVideo(myVideo),
        (themAudio: IRemoteAudioTrack) => setThemAudio(themAudio),
        rtcToken
      );
      rtcClientRef.current = client;
    } else {
      const { room, rtcToken, rtmToken } = await createRoom(userId);
      setRoom(room);
      const { channel } = await connectToAgoraRtm(
        room._id,
        userId,
        (message: TMessage) => setMessages((cur) => [...cur, message]),
        rtmToken
      );
      channelRef.current = channel;

      const { tracks, client } = await connectToAgoraRtc(
        room._id,
        userId,
        (themVideo: IRemoteVideoTrack) => setThemVideo(themVideo),
        (myVideo: ICameraVideoTrack) => setMyVideo(myVideo),
        (themAudio: IRemoteAudioTrack) => setThemAudio(themAudio),
        rtcToken
      );
      rtcClientRef.current = client;
    }
  }

  function convertToYouThem(message: TMessage) {
    return message.userId === userId ? 'You' : 'Them';
  }
  const isChatting = room!!;

  function playSound() {
    if (audioRef.current) {
      setIsPlaying(true);
      audioRef.current.play();
    }
  }

  function clearIsDetected() {
    isMoved.current = false;
    setIsPlaying(false);
    console.log('wascall logger', isMoved);
  }

  return (
    <>
      <Head>
        <title>Create Next App</title>
        <meta name='description' content='Generated by create next app' />
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <link rel='icon' href='/favicon.ico' />
      </Head>

      <main className={styles.main}>
        {isChatting ? (
          <>
            {room._id}
            {/* {imageSrc && <img src={imageSrc} style={{ width: "100%", height: "100%"}}/>}
            {imageSrc2 && <img src={imageSrc2} style={{ width: "100%", height: "100%"}}/>} */}
            <button onClick={handleNextClick}>next</button>
            <div className='chat-window'>
              <div className='video-panel'>
                <div className='video-stream' id='video-container-1'>
                  {myVideo && (
                    <VideoPlayer
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                      }}
                      videoTrack={myVideo}
                    />
                  )}
                  {isMoved.current && whoMoved === 'you' && (
                    <Image
                      src={img}
                      alt='Ricardo'
                      style={{
                        position: 'absolute',
                        zIndex: 100,
                        width: '100%',
                        height: '100%',
                      }}
                    />
                  )}
                </div>
                <div className='video-stream' id='video-container-2'>
                  {themVideo && (
                    <VideoPlayer
                      style={{
                        width: '100%',
                        height: '100%',
                        position: 'absolute',
                      }}
                      videoTrack={themVideo}
                    />
                  )}
                  {isMoved.current && whoMoved === 'another' && (
                    <Image
                      src={img}
                      alt='Ricardo'
                      style={{
                        position: 'absolute',
                        zIndex: 100,
                        width: '100%',
                        height: '100%',
                      }}
                    />
                  )}
                </div>
              </div>

              <div className='chat-panel'>
                <ul>
                  {messages.map((message, idx) => (
                    <li key={idx}>
                      {convertToYouThem(message)} - {message.message}
                    </li>
                  ))}
                </ul>

                <form onSubmit={handleSubmitMessage}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                  ></input>
                  <button>submit</button>
                </form>
                <audio
                  ref={audioRef}
                  controls
                  style={{ display: 'none' }}
                  src='./steve-lacy-staic.mp3'
                >
                  Your browser does not support the
                  <code>audio</code> element.
                </audio>
              </div>
            </div>
          </>
        ) : (
          <div>
            <Image
              src={egg}
              onClick={handleStartChattingClicked}
              className='egg-button'
            />
          </div>
        )}
      </main>
    </>
  );
}

function getFrameDifference(
  data1: Uint8ClampedArray,
  data2: Uint8ClampedArray
) {
  let diff = 0;
  for (let i = 0; i < data1.length; i += 4) {
    diff +=
      Math.abs(data1[i] - data2[i]) +
      Math.abs(data1[i + 1] - data2[i + 1]) +
      Math.abs(data1[i + 2] - data2[i + 2]);
  }
  return diff;
}
