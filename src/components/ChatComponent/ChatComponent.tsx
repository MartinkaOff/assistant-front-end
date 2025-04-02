'use client'

import { useEffect, useRef, useState } from "react";
import { MessageBox } from "react-chat-elements";
import { useUser } from "@/app/hooks/useUser";
import { usePsy } from "@/app/hooks/usePsy";
import { useRouter } from "next/navigation";

import "react-chat-elements/dist/main.css";
import { axiosClassic } from "@/api/interceptors";
import { useChat } from "@/app/hooks/useChat";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from '../../app/hooks/useSocket'
import { useCallPsy } from "@/app/hooks/useCallPsy";
import Modal from '@/components/Modal/Modal'


interface IMessage {
    //@ts-ignore
    position: left | right;
    title: string;
    text: string
}

export default function ChatComponent({ chatId, messagesInChat }: { chatId?: string; messagesInChat?: any[] }) {
    const [messages, setMessages] = useState<IMessage[]>([]);
    const [input, setInput] = useState("");
    const [members, setMembers] = useState<any>([])
    const [openModal, setOpenModal] = useState(false)

    const router = useRouter()
    const queryClient = useQueryClient();
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const userId = typeof window !== "undefined" ? localStorage.getItem("userId") ?? undefined : undefined;

    const { data: user, isLoading, error } = useUser(userId)
    const { data: psy, } = usePsy(userId)
    const { data: chat } = useChat(chatId)
    const { callPsychologist } = useCallPsy()

    //@ts-ignore
    const socket = useSocket(userId)



    useEffect(() => {
        updateMessagesInChat();
        if (psy && chatId) {
            callPsychologist(chatId, false)
        }
    }, [messagesInChat, psy, chatId, socket]);

    useEffect(() => {
        if (!socket || !chatId) return;

        socket.emit("joinChat", chatId);
        console.log(`🔗 Присоединился к чату: ${chatId}`);

        socket.on("newMessage", (newMessage: IMessage) => {
            console.log("📩 Новое сообщение из WebSocket:", newMessage);

            const reverseMessage = { ...newMessage, position: "left" }

            setMessages((prev) => {
                const updatedMessages = [...prev, reverseMessage];
                const reverseMessages = updatedMessages.map(message => ({
                    ...message,
                    position: message.position === 'left' ? 'right' : 'left'
                }))
                return updatedMessages
            });

        });

        socket.on("userJoined", ({ members: newMembers }) => {
            console.log(`👤 Обновленный список участников:`, newMembers);
            //@ts-ignore
            setMembers((prev) => {
                const isDifferent = JSON.stringify(prev) !== JSON.stringify(newMembers);
                return isDifferent ? newMembers : prev;
            });
        });


        socket.on("userLeave", ({ userId, members: newMembers }) => {
            console.log(`🚪 Пользователь ${userId} вышел из чата, обновляем участников`, newMembers);
            //@ts-ignore
            setMembers((prev) => {
                const isDifferent = JSON.stringify(prev) !== JSON.stringify(newMembers);
                return isDifferent ? newMembers : prev;
            });
        });


        return () => {
            socket.off("newMessage");
            socket.off("userJoined");
            socket.off("userLeave");
        };
    }, [socket, chatId]);


    useEffect(() => {
        if (!userId && !isLoading) {
            router.push("/login");
        }
    }, [user, isLoading, router]);

    const handleLeaveChat = () => {
        socket?.emit("leaveChat", chatId);
        router.push('/chatsList')
    };

    const sendMessage = () => {
        if (!input.trim()) return;

        updateMessagesInChat();

        console.log("📨 Отправка сообщения:", input);

        const userMessage = {
            position: psy ? "left" : "right",
            title: psy ? psy.name : user?.name,
            text: input,
        };
        //@ts-ignore
        setMessages((prev) => [...prev, userMessage]);

        socket?.emit("sendMessage", { chatId, message: userMessage });

        setInput("");
    };

    //@ts-ignore
    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!input.trim()) return;

        setInput("");

        const userMessage = {
            position: psy ? "left" : "right",
            // type: "text",
            title: psy ? psy.name : user?.name,
            text: input,
        };

        //@ts-ignore
        setMessages((prev) => [...prev, userMessage]);

        try {

            let data;

            if (chat?.members.length !== 3 && members.length !== 3) {
                const lastFiveMessage = chat ? chat.messages
                    .map((message: any, index: number) =>
                        `${index % 2 === 0 ? 'Пользователь' : 'Психолог'}: ${message?.text}`
                    )
                    .join('\n') : ""


                const res = await axiosClassic.post("yandex-gpt/generate", JSON.stringify({
                    prompt: `Ты профессиональный психолог-ассистент. 
            Отправляй ТОЛЬКО короткие ответы. Общайся так, чтобы поддерживать, 
            давать полезные советы и помогать пользователю разобраться в своих чувствах. 
            
            ${lastFiveMessage}
            Пользователь: ${input}
            Психолог:`,
                }));

                data = await res.data;


                const botMessage = {
                    position: "left",
                    // type: "text",
                    title: "Ассистент",
                    text: data.response,
                };

                //@ts-ignore
                setMessages((prev) => [...prev, botMessage]);

                await axiosClassic.put(`/chat/${chatId}`, { chatId: chatId, messages: [userMessage, botMessage] })
            } else {
                setMessages((prev) => [...prev]);

                sendMessage()

                await axiosClassic.put(`/chat/${chatId}`, { chatId: chatId, messages: [userMessage] })
            }



            //@ts-ignore
            queryClient.invalidateQueries(["chat", chatId])

            updateMessagesInChat();

            setInput("")
        } catch (error) {
            console.error("Error fetching response:", error);
        }
    };

    const updateMessagesInChat = () => {
        if (messagesInChat) {
            setMessages(messagesInChat)

            if (psy && messagesInChat.length > 0) {
                //@ts-ignore
                setMessages(chat?.messages)

                setMessages(messages => messages.map(msg => ({
                    ...msg,
                    position: msg.position === 'left' ? 'right' : 'left'
                })));
            }
        }
    }

    const handleOpenModal = () => {
        setOpenModal(true)
    }


    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    return (
        <div className="h-[100dvh] flex flex-col mx-auto border border-gray-300 p-4 rounded-lg overflow-hidden">
            <Modal title={"Подтвердите"} content={"Вы уверены что хотите выйти из чата?"} openModal={openModal} setOpenModal={setOpenModal} action={handleLeaveChat} />
            <div className="flex-1 overflow-auto p-2 bg-white rounded-lg">
                {messages.map((msg, index) => (
                    //@ts-ignore
                    <MessageBox key={index} type="text" {...msg} />
                ))}
                <div ref={messagesEndRef} /> {/* Невидимый элемент для прокрутки */}
            </div>

            <form onSubmit={handleSubmit} className="flex mt-4">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    className="flex-1 p-2 border border-gray-300 rounded-lg"
                />
                <button type="submit" className="ml-2 p-2 bg-blue-500 text-white rounded-lg">Отправить</button>
                {psy ?
                    <button type="button" onClick={handleOpenModal} className="ml-2 p-2 bg-red-500 text-white rounded-lg">Выйти из чата</button>
                    : <button type="button" onClick={() => callPsychologist(chatId, true)} className="ml-2 p-2 bg-green-500 text-white rounded-lg">Позвать психолога</button>}
            </form>
        </div>

    );
}
