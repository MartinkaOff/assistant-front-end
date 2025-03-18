import { axiosClassic } from "@/api/interceptors";

class ChatService {
    private BASE_URL = '/chat'

    async createChat(chatId: string, messages: any[], members: string[]) {
        console.log('Отправляем в API:', { chatId, messages, members });
        const response = await axiosClassic.post(this.BASE_URL, { chatId, messages, members });
        return response.data;
    }


    async getChat(chatId: string) {
        const response = await axiosClassic.get(`${this.BASE_URL}/${chatId}`)
        return response
    }
}

export const chatService = new ChatService()