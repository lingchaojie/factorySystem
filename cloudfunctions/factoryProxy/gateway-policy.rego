package authz.user

default allow := false

factory_proxy if {
    input.cloudbase.entrypoint_type == "tcbgateway"
    input.cloudbase.resource_type == "functions"
    input.request.method == "POST"
    input.request.path == "/factory-proxy"
}

allow if {
    factory_proxy
}

deny contains "Public client may only invoke factoryProxy" if {
    input.subject.auth_type in {"anon", "anonymous", "unauthenticated"}
    not factory_proxy
}
