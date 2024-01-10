export const LoginStart = (userCredentail) =>({
    type:"LOGIN_START"
})

export const LoginSuccess = (user) =>({
    type:"LOGIN_START",
    payload:user
})

export const LoginFailure = (error) =>({
    type:"LOGIN_FAILURE",
    payload:error
})
