def register_socket_events(socketio):
    @socketio.on("connect")
    def handle_connect():
        print("Socket client connected")